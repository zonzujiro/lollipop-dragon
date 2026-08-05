import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../config", () => ({
  WORKER_URL: "https://mock-worker.test",
}));

import { encrypt, generateKey } from "../../../services/crypto";
import { startRelayForDoc, stopRelay } from "../controller";
import { useAppStore } from "../../../store";
import {
  makePeerComment,
  makeShare,
  resetTestStore,
  setTestState,
} from "../../../testing/testHelpers";
import { RelayHubSqlite } from "../../../../worker/src/relay";

interface DocMetaRow {
  hostSecretHash: string;
  expiresAt: number;
}

interface CommentRow {
  docId: string;
  cmtId: string;
  payload: string;
  createdAt: number;
  expiresAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSocketFrame(message: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(message);
  if (!isRecord(parsed)) {
    throw new Error("Expected relay socket frame to be an object");
  }
  return parsed;
}

class FakeSqlCursor implements SqlStorageCursor {
  constructor(private readonly rows: Array<Record<string, unknown>>) {}

  toArray(): Array<Record<string, unknown>> {
    return this.rows;
  }
}

class FakeSqlStorage implements SqlStorage {
  private docMetaRows = new Map<string, DocMetaRow>();

  private commentRows: CommentRow[] = [];

  exec(query: string, ...params: Array<string | number>): SqlStorageCursor {
    const normalizedQuery = query.replace(/\s+/g, " ").trim();

    if (
      normalizedQuery.startsWith("CREATE TABLE") ||
      normalizedQuery.startsWith("CREATE INDEX")
    ) {
      return new FakeSqlCursor([]);
    }

    if (normalizedQuery.startsWith("INSERT INTO doc_meta")) {
      const docId = this.expectString(params[0]);
      const hostSecretHash = this.expectString(params[1]);
      const expiresAt = this.expectNumber(params[2]);
      this.docMetaRows.set(docId, { hostSecretHash, expiresAt });
      return new FakeSqlCursor([]);
    }

    if (normalizedQuery.startsWith("SELECT expires_at FROM doc_meta")) {
      const docId = this.expectString(params[0]);
      const row = this.docMetaRows.get(docId);
      if (!row) {
        return new FakeSqlCursor([]);
      }
      return new FakeSqlCursor([{ expires_at: row.expiresAt }]);
    }

    if (
      normalizedQuery.startsWith(
        "SELECT cmt_id, payload FROM comments WHERE doc_id = ? AND expires_at > ? ORDER BY created_at",
      )
    ) {
      const docId = this.expectString(params[0]);
      const now = this.expectNumber(params[1]);
      const rows = this.commentRows
        .filter(
          (commentRow) =>
            commentRow.docId === docId && commentRow.expiresAt > now,
        )
        .sort((leftRow, rightRow) => leftRow.createdAt - rightRow.createdAt)
        .map((commentRow) => ({
          cmt_id: commentRow.cmtId,
          payload: commentRow.payload,
        }));
      return new FakeSqlCursor(rows);
    }

    if (
      normalizedQuery.startsWith(
        "SELECT 1 AS found FROM comments WHERE doc_id = ? AND cmt_id = ? LIMIT 1",
      )
    ) {
      const docId = this.expectString(params[0]);
      const cmtId = this.expectString(params[1]);
      const found = this.commentRows.some(
        (commentRow) =>
          commentRow.docId === docId && commentRow.cmtId === cmtId,
      );
      return new FakeSqlCursor(found ? [{ found: 1 }] : []);
    }

    if (
      normalizedQuery.startsWith(
        "SELECT COUNT(*) AS comment_count, COALESCE(SUM(LENGTH(payload)), 0) AS payload_chars FROM comments WHERE doc_id = ?",
      )
    ) {
      const docId = this.expectString(params[0]);
      const rows = this.commentRows.filter(
        (commentRow) => commentRow.docId === docId,
      );
      return new FakeSqlCursor([
        {
          comment_count: rows.length,
          payload_chars: rows.reduce(
            (total, commentRow) => total + commentRow.payload.length,
            0,
          ),
        },
      ]);
    }

    if (normalizedQuery.startsWith("INSERT OR IGNORE INTO comments")) {
      const docId = this.expectString(params[0]);
      const cmtId = this.expectString(params[1]);
      const payload = this.expectString(params[2]);
      const createdAt = this.expectNumber(params[3]);
      const expiresAt = this.expectNumber(params[4]);
      const exists = this.commentRows.some(
        (commentRow) =>
          commentRow.docId === docId && commentRow.cmtId === cmtId,
      );
      if (!exists) {
        this.commentRows.push({ docId, cmtId, payload, createdAt, expiresAt });
      }
      return new FakeSqlCursor([]);
    }

    if (
      normalizedQuery.startsWith(
        "DELETE FROM comments WHERE doc_id = ? AND cmt_id = ?",
      )
    ) {
      const docId = this.expectString(params[0]);
      const cmtId = this.expectString(params[1]);
      this.commentRows = this.commentRows.filter(
        (commentRow) =>
          !(commentRow.docId === docId && commentRow.cmtId === cmtId),
      );
      return new FakeSqlCursor([]);
    }

    if (normalizedQuery.startsWith("DELETE FROM comments WHERE doc_id = ?")) {
      const docId = this.expectString(params[0]);
      this.commentRows = this.commentRows.filter(
        (commentRow) => commentRow.docId !== docId,
      );
      return new FakeSqlCursor([]);
    }

    if (normalizedQuery.startsWith("DELETE FROM doc_meta WHERE doc_id = ?")) {
      const docId = this.expectString(params[0]);
      this.docMetaRows.delete(docId);
      return new FakeSqlCursor([]);
    }

    if (
      normalizedQuery.startsWith(
        "SELECT MIN(expires_at) AS next_expires_at FROM comments",
      )
    ) {
      const nextExpiresAt = this.commentRows.reduce<number>(
        (currentMin, commentRow) => {
          if (currentMin === 0 || commentRow.expiresAt < currentMin) {
            return commentRow.expiresAt;
          }
          return currentMin;
        },
        0,
      );
      return new FakeSqlCursor([{ next_expires_at: nextExpiresAt }]);
    }

    if (
      normalizedQuery.startsWith("DELETE FROM comments WHERE expires_at <= ?")
    ) {
      const now = this.expectNumber(params[0]);
      this.commentRows = this.commentRows.filter(
        (commentRow) => commentRow.expiresAt > now,
      );
      return new FakeSqlCursor([]);
    }

    throw new Error(`Unhandled SQL query in test: ${normalizedQuery}`);
  }

  seedComment(row: CommentRow): void {
    this.commentRows.push(row);
  }

  hasComment(docId: string, cmtId: string): boolean {
    return this.commentRows.some(
      (commentRow) => commentRow.docId === docId && commentRow.cmtId === cmtId,
    );
  }

  private expectString(value: string | number | undefined): string {
    if (typeof value !== "string") {
      throw new Error("Expected string SQL parameter");
    }
    return value;
  }

  private expectNumber(value: string | number | undefined): number {
    if (typeof value !== "number") {
      throw new Error("Expected number SQL parameter");
    }
    return value;
  }
}

class FakeDurableObjectState implements DurableObjectState {
  private sockets: WebSocket[] = [];

  private sqlStorage = new FakeSqlStorage();

  readonly storage: AlarmStorage = {
    sql: this.sqlStorage,
    setAlarm: async () => undefined,
    deleteAlarm: async () => undefined,
  };

  acceptWebSocket(socket: WebSocket): void {
    this.sockets.push(socket);
  }

  getWebSockets(): WebSocket[] {
    return this.sockets;
  }

  get sql(): FakeSqlStorage {
    return this.sqlStorage;
  }
}

class FakeKvNamespace implements KVNamespace {
  private values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class FakeWebSocket extends EventTarget implements WebSocket {
  static readonly CONNECTING = 0;

  static readonly OPEN = 1;

  static readonly CLOSING = 2;

  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  readonly CONNECTING = FakeWebSocket.CONNECTING;

  readonly OPEN = FakeWebSocket.OPEN;

  readonly CLOSING = FakeWebSocket.CLOSING;

  readonly CLOSED = FakeWebSocket.CLOSED;

  binaryType: BinaryType = "blob";

  bufferedAmount = 0;

  extensions = "";

  protocol = "";

  readyState = FakeWebSocket.CONNECTING;

  url: string;

  onclose: ((event: CloseEvent) => void) | null = null;

  onerror: ((event: Event) => void) | null = null;

  onmessage: ((event: MessageEvent) => void) | null = null;

  onopen: ((event: Event) => void) | null = null;

  private attachment: unknown = undefined;

  private sentMessages: string[] = [];

  private frameTap: ((frame: Record<string, unknown>) => void) | null = null;

  constructor(url = "ws://test.invalid") {
    super();
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    const closeEvent = new CloseEvent("close");
    if (this.onclose) {
      this.onclose(closeEvent);
    }
    this.dispatchEvent(closeEvent);
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (typeof data !== "string") {
      throw new Error("Test socket only supports string sends");
    }
    this.sentMessages.push(data);
    if (this.frameTap) {
      this.frameTap(parseSocketFrame(data));
    }
  }

  serializeAttachment(data: unknown): void {
    this.attachment = data;
  }

  deserializeAttachment(): unknown {
    return this.attachment;
  }

  setFrameTap(frameTap: (frame: Record<string, unknown>) => void): void {
    this.frameTap = frameTap;
  }

  sentFrames(): Array<Record<string, unknown>> {
    return this.sentMessages.map(parseSocketFrame);
  }

  rawSentMessages(): string[] {
    return [...this.sentMessages];
  }

  dispatchOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    const openEvent = new Event("open");
    if (this.onopen) {
      this.onopen(openEvent);
    }
    this.dispatchEvent(openEvent);
  }

  dispatchMessage(message: Record<string, unknown>): void {
    const messageEvent = new MessageEvent("message", {
      data: JSON.stringify(message),
    });
    if (this.onmessage) {
      this.onmessage(messageEvent);
    }
    this.dispatchEvent(messageEvent);
  }

  resetSentFrames(): void {
    this.sentMessages = [];
  }

  static latest(): FakeWebSocket {
    const latestSocket = FakeWebSocket.instances.at(-1);
    if (!latestSocket) {
      throw new Error("No fake WebSocket instances created");
    }
    return latestSocket;
  }

  static reset(): void {
    FakeWebSocket.instances = [];
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function sha256hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createShareMetaJson(
  hostSecretHash: string,
  ttlSeconds = 3600,
): string {
  return JSON.stringify({
    hostSecretHash,
    createdAt: new Date().toISOString(),
    ttl: ttlSeconds,
  });
}

function createRelayHarness() {
  const state = new FakeDurableObjectState();
  const kv = new FakeKvNamespace();
  const env = { LOLLIPOP_DRAGON: kv };
  const relayHub = new RelayHubSqlite(state, env);

  function createSocket(): FakeWebSocket {
    const socket = new FakeWebSocket();
    state.acceptWebSocket(socket);
    return socket;
  }

  return { relayHub, state, kv, createSocket };
}

beforeEach(() => {
  resetTestStore();
  FakeWebSocket.reset();
});

afterEach(() => {
  stopRelay();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  FakeWebSocket.reset();
});

describe("RelayHubSqlite", () => {
  it("verifies host subscribe and sends an ordered, non-expired snapshot", async () => {
    const { relayHub, state, kv, createSocket } = createRelayHarness();
    const hostSecret = "host-secret";
    const hostSecretHash = await sha256hex(hostSecret);
    kv.set("share:doc-1:meta", createShareMetaJson(hostSecretHash));
    state.sql.seedComment({
      docId: "doc-1",
      cmtId: "expired",
      payload: "expired-payload",
      createdAt: 1,
      expiresAt: Date.now() - 1,
    });
    state.sql.seedComment({
      docId: "doc-1",
      cmtId: "c-2",
      payload: "payload-2",
      createdAt: 20,
      expiresAt: Date.now() + 60_000,
    });
    state.sql.seedComment({
      docId: "doc-1",
      cmtId: "c-1",
      payload: "payload-1",
      createdAt: 10,
      expiresAt: Date.now() + 60_000,
    });

    const hostSocket = createSocket();

    await relayHub.webSocketMessage(
      hostSocket,
      JSON.stringify({
        type: "subscribe",
        docId: "doc-1",
        role: "host",
        hostSecret,
      }),
    );

    expect(hostSocket.sentFrames()).toEqual([
      { type: "subscribe:ok", docId: "doc-1" },
      {
        type: "comments:snapshot",
        docId: "doc-1",
        comments: [
          { cmtId: "c-1", payload: "payload-1" },
          { cmtId: "c-2", payload: "payload-2" },
        ],
      },
    ]);
  });

  it("rejects invalid host subscribe secrets", async () => {
    const { relayHub, kv, createSocket } = createRelayHarness();
    kv.set(
      "share:doc-1:meta",
      createShareMetaJson(await sha256hex("expected")),
    );

    const hostSocket = createSocket();

    await relayHub.webSocketMessage(
      hostSocket,
      JSON.stringify({
        type: "subscribe",
        docId: "doc-1",
        role: "host",
        hostSecret: "wrong-secret",
      }),
    );

    expect(hostSocket.sentFrames()).toEqual([
      { type: "error", docId: "doc-1", message: "Forbidden" },
    ]);
  });

  it("persists comment:add and forwards it only to host subscribers", async () => {
    const { relayHub, state, kv, createSocket } = createRelayHarness();
    const hostSecret = "host-secret";
    kv.set(
      "share:doc-1:meta",
      createShareMetaJson(await sha256hex(hostSecret)),
    );

    const hostSocket = createSocket();
    const peerSocket = createSocket();

    await relayHub.webSocketMessage(
      hostSocket,
      JSON.stringify({
        type: "subscribe",
        docId: "doc-1",
        role: "host",
        hostSecret,
      }),
    );
    hostSocket.resetSentFrames();

    await relayHub.webSocketMessage(
      peerSocket,
      JSON.stringify({
        type: "subscribe",
        docId: "doc-1",
        role: "peer",
      }),
    );
    peerSocket.resetSentFrames();

    await relayHub.webSocketMessage(
      peerSocket,
      JSON.stringify({
        type: "comment:add",
        docId: "doc-1",
        cmtId: "c-1",
        payload: "ciphertext",
      }),
    );

    expect(state.sql.hasComment("doc-1", "c-1")).toBe(true);
    expect(peerSocket.sentFrames()).toEqual([
      { type: "comment:add:ack", docId: "doc-1", cmtId: "c-1" },
    ]);
    expect(hostSocket.sentFrames()).toEqual([
      {
        type: "comment:added",
        docId: "doc-1",
        cmtId: "c-1",
        payload: "ciphertext",
      },
    ]);
  });

  it("rejects comment:add from sockets that never subscribed to the doc", async () => {
    const { relayHub, state, kv, createSocket } = createRelayHarness();
    kv.set(
      "share:doc-1:meta",
      createShareMetaJson(await sha256hex("host-secret")),
    );

    const unsubscribedSocket = createSocket();

    await relayHub.webSocketMessage(
      unsubscribedSocket,
      JSON.stringify({
        type: "comment:add",
        docId: "doc-1",
        cmtId: "c-1",
        payload: "ciphertext",
      }),
    );

    expect(unsubscribedSocket.sentFrames()).toEqual([
      {
        type: "error",
        docId: "doc-1",
        message: "Not subscribed as peer",
      },
    ]);
    expect(state.sql.hasComment("doc-1", "c-1")).toBe(false);
  });

  it("deletes the row before sending comment:resolve:ack", async () => {
    const { relayHub, state, kv, createSocket } = createRelayHarness();
    const hostSecret = "host-secret";
    kv.set(
      "share:doc-1:meta",
      createShareMetaJson(await sha256hex(hostSecret)),
    );

    const hostSocket = createSocket();
    const peerSocket = createSocket();

    await relayHub.webSocketMessage(
      hostSocket,
      JSON.stringify({
        type: "subscribe",
        docId: "doc-1",
        role: "host",
        hostSecret,
      }),
    );
    await relayHub.webSocketMessage(
      peerSocket,
      JSON.stringify({
        type: "subscribe",
        docId: "doc-1",
        role: "peer",
      }),
    );

    state.sql.seedComment({
      docId: "doc-1",
      cmtId: "c-1",
      payload: "ciphertext",
      createdAt: 1,
      expiresAt: Date.now() + 60_000,
    });
    hostSocket.resetSentFrames();
    peerSocket.resetSentFrames();
    hostSocket.setFrameTap((frame) => {
      if (frame["type"] === "comment:resolve:ack") {
        expect(state.sql.hasComment("doc-1", "c-1")).toBe(false);
      }
    });

    await relayHub.webSocketMessage(
      hostSocket,
      JSON.stringify({
        type: "comment:resolve",
        docId: "doc-1",
        cmtId: "c-1",
      }),
    );

    expect(hostSocket.sentFrames()).toEqual([
      { type: "comment:resolve:ack", docId: "doc-1", cmtId: "c-1" },
    ]);
    expect(peerSocket.sentFrames()).toEqual([
      { type: "comment:resolved", docId: "doc-1", cmtId: "c-1" },
    ]);
  });

  it("echoes each recipient subscription generation on snapshots and live events", async () => {
    const { relayHub, kv, createSocket } = createRelayHarness();
    const hostSecret = "host-secret";
    kv.set(
      "share:doc-1:meta",
      createShareMetaJson(await sha256hex(hostSecret)),
    );
    const hostSocket = createSocket();
    const peerSocket = createSocket();

    await relayHub.webSocketMessage(
      hostSocket,
      JSON.stringify({
        type: "subscribe",
        docId: "doc-1",
        role: "host",
        hostSecret,
        subscriptionId: "host-generation",
      }),
    );
    expect(hostSocket.sentFrames()).toEqual([
      {
        type: "subscribe:ok",
        docId: "doc-1",
        subscriptionId: "host-generation",
      },
      {
        type: "comments:snapshot",
        docId: "doc-1",
        comments: [],
        subscriptionId: "host-generation",
        snapshotId: expect.any(String),
        chunkIndex: 0,
        chunkCount: 1,
      },
    ]);
    hostSocket.resetSentFrames();

    await relayHub.webSocketMessage(
      peerSocket,
      JSON.stringify({
        type: "subscribe",
        docId: "doc-1",
        role: "peer",
        subscriptionId: "peer-generation",
      }),
    );
    peerSocket.resetSentFrames();
    await relayHub.webSocketMessage(
      peerSocket,
      JSON.stringify({
        type: "comment:add",
        docId: "doc-1",
        cmtId: "c-generation",
        payload: "ciphertext",
        subscriptionId: "peer-generation",
      }),
    );

    expect(peerSocket.sentFrames()).toEqual([
      {
        type: "comment:add:ack",
        docId: "doc-1",
        cmtId: "c-generation",
        subscriptionId: "peer-generation",
      },
    ]);
    expect(hostSocket.sentFrames()).toEqual([
      {
        type: "comment:added",
        docId: "doc-1",
        cmtId: "c-generation",
        payload: "ciphertext",
        subscriptionId: "host-generation",
      },
    ]);
  });

  it("chunks a generation-scoped snapshot below the inbound frame limit", async () => {
    const { relayHub, state, kv, createSocket } = createRelayHarness();
    const hostSecret = "host-secret";
    kv.set(
      "share:doc-1:meta",
      createShareMetaJson(await sha256hex(hostSecret)),
    );
    const expiresAt = Date.now() + 60_000;
    state.sql.seedComment({
      docId: "doc-1",
      cmtId: "large-1",
      payload: "a".repeat(800_000),
      createdAt: 1,
      expiresAt,
    });
    state.sql.seedComment({
      docId: "doc-1",
      cmtId: "large-2",
      payload: "b".repeat(800_000),
      createdAt: 2,
      expiresAt,
    });
    const hostSocket = createSocket();

    await relayHub.webSocketMessage(
      hostSocket,
      JSON.stringify({
        type: "subscribe",
        docId: "doc-1",
        role: "host",
        hostSecret,
        subscriptionId: "chunked-generation",
      }),
    );

    const frames = hostSocket.sentFrames();
    const snapshotFrames = frames.filter(
      (frame) => frame["type"] === "comments:snapshot",
    );
    expect(snapshotFrames).toHaveLength(2);
    expect(snapshotFrames.map((frame) => frame["chunkIndex"])).toEqual([0, 1]);
    expect(snapshotFrames.every((frame) => frame["chunkCount"] === 2)).toBe(
      true,
    );
    expect(
      hostSocket
        .rawSentMessages()
        .slice(1)
        .every((message) => {
          return new TextEncoder().encode(message).byteLength < 1_500_000;
        }),
    ).toBe(true);
  });

  it("echoes a stale operation generation without failing the current one", async () => {
    const { relayHub, state, kv, createSocket } = createRelayHarness();
    kv.set(
      "share:doc-1:meta",
      createShareMetaJson(await sha256hex("host-secret")),
    );
    const peerSocket = createSocket();
    await relayHub.webSocketMessage(
      peerSocket,
      JSON.stringify({
        type: "subscribe",
        docId: "doc-1",
        role: "peer",
        subscriptionId: "current-generation",
      }),
    );
    peerSocket.resetSentFrames();

    await relayHub.webSocketMessage(
      peerSocket,
      JSON.stringify({
        type: "comment:add",
        docId: "doc-1",
        cmtId: "stale-comment",
        payload: "ciphertext",
        subscriptionId: "old-generation",
      }),
    );

    expect(peerSocket.sentFrames()).toEqual([
      {
        type: "error",
        docId: "doc-1",
        cmtId: "stale-comment",
        scope: "operation",
        message: "Stale subscription generation",
        subscriptionId: "old-generation",
      },
    ]);
    expect(state.sql.hasComment("doc-1", "stale-comment")).toBe(false);
  });

  it("forwards encrypted document updates only from a subscribed host", async () => {
    const { relayHub, kv, createSocket } = createRelayHarness();
    const hostSecret = "host-secret";
    kv.set(
      "share:doc-1:meta",
      createShareMetaJson(await sha256hex(hostSecret)),
    );
    const hostSocket = createSocket();
    const peerSocket = createSocket();
    await relayHub.webSocketMessage(
      hostSocket,
      JSON.stringify({
        type: "subscribe",
        docId: "doc-1",
        role: "host",
        hostSecret,
        subscriptionId: "host-generation",
      }),
    );
    await relayHub.webSocketMessage(
      peerSocket,
      JSON.stringify({
        type: "subscribe",
        docId: "doc-1",
        role: "peer",
        subscriptionId: "peer-generation",
      }),
    );
    hostSocket.resetSentFrames();
    peerSocket.resetSentFrames();

    await relayHub.webSocketMessage(
      hostSocket,
      JSON.stringify({
        version: 1,
        docId: "doc-1",
        payload: "encrypted-update",
        subscriptionId: "host-generation",
      }),
    );

    expect(hostSocket.sentFrames()).toEqual([]);
    expect(peerSocket.sentFrames()).toEqual([
      {
        version: 1,
        docId: "doc-1",
        payload: "encrypted-update",
        subscriptionId: "peer-generation",
      },
    ]);
  });

  it("rejects oversized encrypted comment payloads before persistence", async () => {
    const { relayHub, state, kv, createSocket } = createRelayHarness();
    kv.set(
      "share:doc-1:meta",
      createShareMetaJson(await sha256hex("host-secret")),
    );
    const peerSocket = createSocket();
    await relayHub.webSocketMessage(
      peerSocket,
      JSON.stringify({ type: "subscribe", docId: "doc-1", role: "peer" }),
    );
    peerSocket.resetSentFrames();

    await relayHub.webSocketMessage(
      peerSocket,
      JSON.stringify({
        type: "comment:add",
        docId: "doc-1",
        cmtId: "c-oversized",
        payload: "A".repeat(1_400_000),
      }),
    );

    expect(state.sql.hasComment("doc-1", "c-oversized")).toBe(false);
    expect(peerSocket.sentFrames()).toEqual([
      {
        type: "error",
        docId: "doc-1",
        cmtId: "c-oversized",
        scope: "operation",
        message: "Comment payload too large",
      },
    ]);
  });

  it("rate limits comment writes per socket", async () => {
    const { relayHub, kv, createSocket } = createRelayHarness();
    kv.set(
      "share:doc-1:meta",
      createShareMetaJson(await sha256hex("host-secret")),
    );
    const peerSocket = createSocket();
    await relayHub.webSocketMessage(
      peerSocket,
      JSON.stringify({ type: "subscribe", docId: "doc-1", role: "peer" }),
    );
    peerSocket.resetSentFrames();

    for (let commentIndex = 0; commentIndex < 61; commentIndex += 1) {
      await relayHub.webSocketMessage(
        peerSocket,
        JSON.stringify({
          type: "comment:add",
          docId: "doc-1",
          cmtId: `c-${commentIndex}`,
          payload: "ciphertext",
        }),
      );
    }

    expect(peerSocket.sentFrames().at(-1)).toEqual({
      type: "error",
      docId: "doc-1",
      cmtId: "c-60",
      scope: "operation",
      message: "Comment rate limit exceeded",
    });
  });
});

describe("relay client snapshot validation", () => {
  it("drops snapshot entries whose decrypted payload id does not match cmtId", async () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);

    const key = await generateKey();
    const share = makeShare({ docId: "doc-1" });
    setTestState(
      {
        shares: [share],
        shareKeys: { "doc-1": key },
      },
      {
        isPeerMode: false,
      },
    );

    const mismatchedComment = makePeerComment({ id: "payload-id" });
    const encoded = new TextEncoder().encode(JSON.stringify(mismatchedComment));
    const encrypted = await encrypt(encoded, key);
    const payload = arrayBufferToBase64(encrypted);

    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    startRelayForDoc("doc-1");
    const socket = FakeWebSocket.latest();
    socket.dispatchOpen();
    socket.dispatchMessage({ type: "subscribe:ok", docId: "doc-1" });
    socket.dispatchMessage({
      type: "comments:snapshot",
      docId: "doc-1",
      comments: [{ cmtId: "frame-id", payload }],
    });

    await waitFor(() => {
      const activeTab = useAppStore
        .getState()
        .tabs.find((tab) => tab.id === "test-tab");
      expect(activeTab?.pendingComments["doc-1"]).toBeUndefined();
      expect(
        activeTab?.incomingReviewSessions["doc-1"]?.quarantinedItems,
      ).toHaveLength(1);
      expect(warnSpy).toHaveBeenCalledWith(
        "[relay] failed to decrypt snapshot comment:",
        expect.any(Error),
      );
    });
  });
});
