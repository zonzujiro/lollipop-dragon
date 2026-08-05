import { encrypt, decrypt } from "../../services/crypto";
import type {
  CommentsSnapshotEntry,
  RelayEvent,
  RelayMessage,
  RelaySubscriptionRole,
  RelaySubscriptionState,
} from "../../types/relay";
import type { PeerComment } from "../../types/share";
import { isCommentType } from "../../markup/commentProtocol";
import { WORKER_URL } from "../../config";
import { ShareStorage } from "../sharing/storage";
import { selectHasPeerLocalCommentWork } from "../peer-review/selectors";
import { getRelayApplicationState } from "./applicationPort";
import { recordRelayDiagnostic } from "./diagnostics";

interface RelayEventContext {
  role: RelaySubscriptionRole;
  subscriptionId: string;
}

export interface RelayConnection {
  subscribe(
    docId: string,
    key: CryptoKey,
    role: "host" | "peer",
    hostSecret?: string,
  ): string;
  unsubscribe(docId: string): void;
  sendCommentAdd(docId: string, cmtId: string, payload: string): void;
  sendCommentResolve(docId: string, cmtId: string): void;
  send(docId: string, message: RelayMessage): Promise<void>;
  close(): void;
  hasActiveSubscriptions(): boolean;
  isSubscribed(docId: string): boolean;
}

const VALID_RELAY_TYPES = new Set(["document:updated"]);
const PING_INTERVAL_MS = 30_000;
const SUBSCRIPTION_RETRY_DELAY_MS = 5_000;
const BASE64_CHUNK_SIZE = 8192;
const MAX_INBOUND_FRAME_BYTES = 1_500_000;
const MAX_ENCRYPTED_COMMENT_BYTES = 1024 * 1024;
const MAX_COMMENT_ID_LENGTH = 256;
const MAX_PEER_NAME_LENGTH = 160;
const MAX_PATH_LENGTH = 4096;
const MAX_COMMENT_TEXT_LENGTH = 512 * 1024;
const MAX_CONTENT_PREVIEW_LENGTH = 512;
const MAX_ANCHOR_QUOTE_LENGTH = 512 * 1024;
const MAX_SNAPSHOT_ENTRIES = 500;
const MAX_SNAPSHOT_PAYLOAD_CHARS = 8 * 1024 * 1024;
const MAX_ENCRYPTED_COMMENT_BASE64_CHARS = 1_400_000;
const COMMENT_ID_RE = /^[A-Za-z0-9_-]+$/;

type ParsedFrame =
  | { kind: "pong" }
  | {
      kind: "error";
      docId: string;
      message: string;
      subscriptionId?: string;
      scope: "subscription" | "operation";
      cmtId?: string;
    }
  | { kind: "subscribeOk"; docId: string; subscriptionId?: string }
  | {
      kind: "commentAddAck";
      docId: string;
      cmtId: string;
      subscriptionId?: string;
    }
  | {
      kind: "commentResolveAck";
      docId: string;
      cmtId: string;
      subscriptionId?: string;
    }
  | {
      kind: "commentsSnapshot";
      docId: string;
      comments: CommentsSnapshotEntry[];
      subscriptionId?: string;
      snapshotId?: string;
      chunkIndex?: number;
      chunkCount?: number;
    }
  | {
      kind: "commentAdded";
      docId: string;
      cmtId: string;
      payload: string;
      subscriptionId?: string;
    }
  | {
      kind: "commentResolved";
      docId: string;
      cmtId: string;
      subscriptionId?: string;
    }
  | {
      kind: "relay";
      docId: string;
      payload: string;
      subscriptionId?: string;
    }
  | { kind: "unknown" };

interface SubscriptionMeta {
  role: RelaySubscriptionRole;
  subscriptionId: string;
  hostSecret?: string;
}

interface SnapshotAssembly {
  chunkCount: number;
  chunks: Map<number, CommentsSnapshotEntry[]>;
  entryCount: number;
  payloadChars: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidRelayIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_COMMENT_ID_LENGTH &&
    COMMENT_ID_RE.test(value)
  );
}

function isCommentsSnapshotEntries(
  value: unknown,
): value is CommentsSnapshotEntry[] {
  if (!Array.isArray(value)) {
    return false;
  }
  if (value.length > MAX_SNAPSHOT_ENTRIES) {
    return false;
  }
  return value.every((entry) => {
    if (!isRecord(entry)) {
      return false;
    }
    return (
      isValidRelayIdentifier(entry["cmtId"]) &&
      isBoundedString(entry["payload"], MAX_ENCRYPTED_COMMENT_BASE64_CHARS)
    );
  });
}

function isValidRelayMessage(value: unknown): value is RelayMessage {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value["type"] === "string" && VALID_RELAY_TYPES.has(value["type"])
  );
}

function getSubscriptionId(frame: Record<string, unknown>): string | undefined {
  return isValidRelayIdentifier(frame["subscriptionId"])
    ? frame["subscriptionId"]
    : undefined;
}

function getSnapshotChunkMetadata(frame: Record<string, unknown>):
  | {
      snapshotId: string;
      chunkIndex: number;
      chunkCount: number;
    }
  | undefined {
  const snapshotId = frame["snapshotId"];
  const chunkIndex = frame["chunkIndex"];
  const chunkCount = frame["chunkCount"];
  if (
    !isValidRelayIdentifier(snapshotId) ||
    !Number.isInteger(chunkIndex) ||
    !Number.isInteger(chunkCount) ||
    typeof chunkIndex !== "number" ||
    typeof chunkCount !== "number" ||
    chunkCount <= 0 ||
    chunkCount > MAX_SNAPSHOT_ENTRIES ||
    chunkIndex < 0 ||
    chunkIndex >= chunkCount
  ) {
    return undefined;
  }
  return { snapshotId, chunkIndex, chunkCount };
}

function parseInboundFrame(raw: unknown): ParsedFrame {
  if (!isRecord(raw)) {
    return { kind: "unknown" };
  }
  if (raw.type === "pong") {
    return { kind: "pong" };
  }
  if (raw.type === "error" && isValidRelayIdentifier(raw.docId)) {
    return {
      kind: "error",
      docId: raw.docId,
      message: typeof raw.message === "string" ? raw.message : "Relay error",
      subscriptionId: getSubscriptionId(raw),
      scope: raw.scope === "operation" ? "operation" : "subscription",
      cmtId: isValidRelayIdentifier(raw.cmtId) ? raw.cmtId : undefined,
    };
  }
  if (raw.type === "subscribe:ok" && isValidRelayIdentifier(raw.docId)) {
    return {
      kind: "subscribeOk",
      docId: raw.docId,
      subscriptionId: getSubscriptionId(raw),
    };
  }
  if (
    raw.type === "comment:add:ack" &&
    isValidRelayIdentifier(raw.docId) &&
    isValidRelayIdentifier(raw.cmtId)
  ) {
    return {
      kind: "commentAddAck",
      docId: raw.docId,
      cmtId: raw.cmtId,
      subscriptionId: getSubscriptionId(raw),
    };
  }
  if (
    raw.type === "comment:resolve:ack" &&
    isValidRelayIdentifier(raw.docId) &&
    isValidRelayIdentifier(raw.cmtId)
  ) {
    return {
      kind: "commentResolveAck",
      docId: raw.docId,
      cmtId: raw.cmtId,
      subscriptionId: getSubscriptionId(raw),
    };
  }
  if (
    raw.type === "comments:snapshot" &&
    isValidRelayIdentifier(raw.docId) &&
    isCommentsSnapshotEntries(raw.comments)
  ) {
    const hasChunkMetadata =
      "snapshotId" in raw || "chunkIndex" in raw || "chunkCount" in raw;
    const chunkMetadata = getSnapshotChunkMetadata(raw);
    if (hasChunkMetadata && !chunkMetadata) {
      return { kind: "unknown" };
    }
    return {
      kind: "commentsSnapshot",
      docId: raw.docId,
      comments: raw.comments,
      subscriptionId: getSubscriptionId(raw),
      ...chunkMetadata,
    };
  }
  if (
    raw.type === "comment:added" &&
    isValidRelayIdentifier(raw.docId) &&
    isValidRelayIdentifier(raw.cmtId) &&
    isBoundedString(raw.payload, MAX_ENCRYPTED_COMMENT_BASE64_CHARS)
  ) {
    return {
      kind: "commentAdded",
      docId: raw.docId,
      cmtId: raw.cmtId,
      payload: raw.payload,
      subscriptionId: getSubscriptionId(raw),
    };
  }
  if (
    raw.type === "comment:resolved" &&
    isValidRelayIdentifier(raw.docId) &&
    isValidRelayIdentifier(raw.cmtId)
  ) {
    return {
      kind: "commentResolved",
      docId: raw.docId,
      cmtId: raw.cmtId,
      subscriptionId: getSubscriptionId(raw),
    };
  }
  if (
    raw.version === 1 &&
    isValidRelayIdentifier(raw.docId) &&
    typeof raw.payload === "string"
  ) {
    return {
      kind: "relay",
      docId: raw.docId,
      payload: raw.payload,
      subscriptionId: getSubscriptionId(raw),
    };
  }
  return { kind: "unknown" };
}

async function decryptRelayMessage(
  frame: Extract<ParsedFrame, { kind: "relay" }>,
  key: CryptoKey,
): Promise<RelayMessage | null> {
  const raw = Uint8Array.from(atob(frame.payload), (char) =>
    char.charCodeAt(0),
  );
  const decrypted = await decrypt(raw.buffer, key);
  const parsed: unknown = JSON.parse(new TextDecoder().decode(decrypted));
  if (!isValidRelayMessage(parsed)) {
    console.warn("[relay] invalid message shape, discarding");
    return null;
  }
  return parsed;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    const slice = bytes.subarray(offset, offset + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function encryptedPayloadByteLength(payload: string): number {
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

function isBoundedString(
  value: unknown,
  maximumLength: number,
): value is string {
  return typeof value === "string" && value.length <= maximumLength;
}

function isPeerComment(value: unknown): value is PeerComment {
  if (!isRecord(value)) {
    return false;
  }
  if (
    !isBoundedString(value["id"], MAX_COMMENT_ID_LENGTH) ||
    !COMMENT_ID_RE.test(value["id"])
  ) {
    return false;
  }
  if (!isBoundedString(value["peerName"], MAX_PEER_NAME_LENGTH)) {
    return false;
  }
  if (!isBoundedString(value["path"], MAX_PATH_LENGTH)) {
    return false;
  }
  if (
    typeof value["commentType"] !== "string" ||
    !isCommentType(value["commentType"])
  ) {
    return false;
  }
  if (!isBoundedString(value["text"], MAX_COMMENT_TEXT_LENGTH)) {
    return false;
  }
  if (
    typeof value["createdAt"] !== "string" ||
    Number.isNaN(Date.parse(value["createdAt"]))
  ) {
    return false;
  }
  if (!isRecord(value["blockRef"])) {
    return false;
  }
  const blockRef = value["blockRef"];
  const hasValidAnchorVersion =
    blockRef["anchorVersion"] === undefined || blockRef["anchorVersion"] === 1;
  const hasValidQuote =
    blockRef["quote"] === undefined ||
    isBoundedString(blockRef["quote"], MAX_ANCHOR_QUOTE_LENGTH);
  const hasValidOccurrence =
    blockRef["occurrence"] === undefined ||
    (typeof blockRef["occurrence"] === "number" &&
      Number.isInteger(blockRef["occurrence"]) &&
      blockRef["occurrence"] > 0);
  return (
    typeof blockRef["blockIndex"] === "number" &&
    Number.isFinite(blockRef["blockIndex"]) &&
    Number.isInteger(blockRef["blockIndex"]) &&
    blockRef["blockIndex"] >= 0 &&
    isBoundedString(blockRef["contentPreview"], MAX_CONTENT_PREVIEW_LENGTH) &&
    hasValidAnchorVersion &&
    hasValidQuote &&
    hasValidOccurrence
  );
}

let activeRelay: RelayConnection | null = null;

export function getRelay(): RelayConnection | null {
  return activeRelay;
}

function setRelay(relay: RelayConnection | null): void {
  activeRelay = relay;
}

class RelayConnectionImpl implements RelayConnection {
  private socket: WebSocket | null = null;
  private backoff = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private closedIntentionally = false;
  private confirmedSubscriptions = new Map<string, string>();
  private subscriptionMeta = new Map<string, SubscriptionMeta>();
  private encryptionKeys = new Map<string, CryptoKey>();
  private messageQueues = new Map<string, Promise<void>>();
  private snapshotAssemblies = new Map<string, SnapshotAssembly>();
  private wsUrl: string;

  constructor(
    private onMessage: (
      docId: string,
      event: RelayEvent,
      context: RelayEventContext,
    ) => Promise<void> | void,
    private onStatusChange: (
      status: "connecting" | "connected" | "disconnected",
    ) => void,
  ) {
    if (!WORKER_URL) {
      throw new Error("Worker URL not configured");
    }
    this.wsUrl = WORKER_URL.replace(/^http/, "ws") + "/relay";
    this.openConnection();
  }

  private notifySubscription(
    docId: string,
    meta: SubscriptionMeta,
    phase: RelaySubscriptionState["phase"],
    lastError: string | null,
  ): void {
    handleSubscriptionState(docId, meta.role, {
      subscriptionId: meta.subscriptionId,
      phase,
      lastError,
    });
    recordRelayDiagnostic({
      kind: "subscription",
      docId,
      subscriptionId: meta.subscriptionId,
      role: meta.role,
      frameType: null,
      frameBytes: null,
      phase,
      reason: lastError,
    });
  }

  private sendSubscribeFrame(docId: string, meta: SubscriptionMeta): void {
    this.notifySubscription(docId, meta, "subscribing", null);
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    const frame: Record<string, string> = {
      type: "subscribe",
      docId,
      role: meta.role,
      subscriptionId: meta.subscriptionId,
    };
    if (meta.hostSecret) {
      frame.hostSecret = meta.hostSecret;
    }
    this.socket.send(JSON.stringify(frame));
  }

  private beginNewGeneration(docId: string): SubscriptionMeta | null {
    const previous = this.subscriptionMeta.get(docId);
    if (!previous) {
      return null;
    }
    const next: SubscriptionMeta = {
      ...previous,
      subscriptionId: crypto.randomUUID(),
    };
    this.subscriptionMeta.set(docId, next);
    this.confirmedSubscriptions.delete(docId);
    this.clearSnapshotAssemblies(docId);
    this.sendSubscribeFrame(docId, next);
    return next;
  }

  private scheduleSubscriptionRetry(
    docId: string,
    failedSubscriptionId: string,
  ): void {
    setTimeout(() => {
      const current = this.subscriptionMeta.get(docId);
      if (
        this.socket?.readyState !== WebSocket.OPEN ||
        current?.subscriptionId !== failedSubscriptionId
      ) {
        return;
      }
      this.beginNewGeneration(docId);
    }, SUBSCRIPTION_RETRY_DELAY_MS);
  }

  private isCurrentGeneration(docId: string, subscriptionId: string): boolean {
    return this.subscriptionMeta.get(docId)?.subscriptionId === subscriptionId;
  }

  private clearSnapshotAssemblies(docId: string): void {
    const prefix = `${docId}:`;
    for (const key of this.snapshotAssemblies.keys()) {
      if (key.startsWith(prefix)) {
        this.snapshotAssemblies.delete(key);
      }
    }
  }

  private collectSnapshot(
    frame: Extract<ParsedFrame, { kind: "commentsSnapshot" }>,
    context: RelayEventContext,
  ): CommentsSnapshotEntry[] | null {
    if (
      frame.snapshotId === undefined ||
      frame.chunkIndex === undefined ||
      frame.chunkCount === undefined
    ) {
      return frame.comments;
    }
    const assemblyKey = `${frame.docId}:${context.subscriptionId}:${frame.snapshotId}`;
    const existing = this.snapshotAssemblies.get(assemblyKey);
    const assembly =
      existing?.chunkCount === frame.chunkCount
        ? existing
        : {
            chunkCount: frame.chunkCount,
            chunks: new Map<number, CommentsSnapshotEntry[]>(),
            entryCount: 0,
            payloadChars: 0,
          };
    if (!assembly.chunks.has(frame.chunkIndex)) {
      assembly.chunks.set(frame.chunkIndex, frame.comments);
      assembly.entryCount += frame.comments.length;
      assembly.payloadChars += frame.comments.reduce(
        (total, entry) => total + entry.payload.length,
        0,
      );
    }
    if (
      assembly.entryCount > MAX_SNAPSHOT_ENTRIES ||
      assembly.payloadChars > MAX_SNAPSHOT_PAYLOAD_CHARS
    ) {
      this.snapshotAssemblies.delete(assemblyKey);
      throw new Error("Snapshot exceeds the client safety limit");
    }
    this.snapshotAssemblies.set(assemblyKey, assembly);
    if (assembly.chunks.size !== assembly.chunkCount) {
      return null;
    }
    const comments: CommentsSnapshotEntry[] = [];
    for (
      let chunkIndex = 0;
      chunkIndex < assembly.chunkCount;
      chunkIndex += 1
    ) {
      const chunk = assembly.chunks.get(chunkIndex);
      if (!chunk) {
        return null;
      }
      comments.push(...chunk);
    }
    this.snapshotAssemblies.delete(assemblyKey);
    return comments;
  }

  private getFrameContext(frame: ParsedFrame): RelayEventContext | null {
    if (frame.kind === "pong" || frame.kind === "unknown") {
      return null;
    }
    const meta = this.subscriptionMeta.get(frame.docId);
    if (!meta) {
      return null;
    }
    const subscriptionId = frame.subscriptionId ?? meta.subscriptionId;
    if (subscriptionId !== meta.subscriptionId) {
      recordRelayDiagnostic({
        kind: "rejection",
        docId: frame.docId,
        subscriptionId,
        role: meta.role,
        frameType: frame.kind,
        frameBytes: null,
        phase: null,
        reason: "stale subscription generation",
      });
      return null;
    }
    return { role: meta.role, subscriptionId };
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: "ping" }));
      }
    }, PING_INTERVAL_MS);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private handleSocketOpen = (): void => {
    if (this.closedIntentionally) {
      this.socket?.close();
      return;
    }
    this.backoff = 1000;
    this.confirmedSubscriptions.clear();
    this.onStatusChange("connecting");
    this.startPingInterval();
    this.resubscribeAll();
  };

  private resubscribeAll(): void {
    for (const docId of this.subscriptionMeta.keys()) {
      this.beginNewGeneration(docId);
    }
  }

  private processFrame = async (
    frame: ParsedFrame,
    context: RelayEventContext,
  ): Promise<void> => {
    if (frame.kind === "pong" || frame.kind === "unknown") {
      return;
    }
    if (!this.isCurrentGeneration(frame.docId, context.subscriptionId)) {
      return;
    }
    const meta = this.subscriptionMeta.get(frame.docId);
    if (!meta) {
      return;
    }

    if (frame.kind === "error") {
      console.warn(
        "[relay] server error for docId",
        frame.docId,
        ":",
        frame.message,
      );
      if (frame.scope === "operation") {
        recordRelayDiagnostic({
          kind: "rejection",
          docId: frame.docId,
          subscriptionId: context.subscriptionId,
          role: context.role,
          frameType: "error",
          frameBytes: null,
          phase: null,
          reason: frame.message,
        });
        getRelayApplicationState().showToast(frame.message);
        return;
      }
      this.confirmedSubscriptions.delete(frame.docId);
      this.notifySubscription(frame.docId, meta, "failed", frame.message);
      this.onStatusChange(
        this.confirmedSubscriptions.size > 0 ? "connected" : "disconnected",
      );
      this.scheduleSubscriptionRetry(frame.docId, context.subscriptionId);
      return;
    }
    if (frame.kind === "subscribeOk") {
      this.confirmedSubscriptions.set(frame.docId, context.subscriptionId);
      this.onStatusChange("connected");
      this.notifySubscription(
        frame.docId,
        meta,
        context.role === "host" ? "syncing" : "live",
        null,
      );
      handleSubscribeConfirmed(frame.docId, context);
      return;
    }
    if (frame.kind === "commentAddAck") {
      await this.onMessage(
        frame.docId,
        { type: "comment:add:ack", cmtId: frame.cmtId },
        context,
      );
      return;
    }
    if (frame.kind === "commentResolveAck") {
      await this.onMessage(
        frame.docId,
        { type: "comment:resolve:ack", cmtId: frame.cmtId },
        context,
      );
      return;
    }
    if (frame.kind === "commentsSnapshot") {
      const comments = this.collectSnapshot(frame, context);
      if (!comments) {
        return;
      }
      await this.onMessage(
        frame.docId,
        { type: "comments:snapshot", comments },
        context,
      );
      if (this.isCurrentGeneration(frame.docId, context.subscriptionId)) {
        this.notifySubscription(frame.docId, meta, "live", null);
      }
      return;
    }
    if (frame.kind === "commentAdded") {
      await this.onMessage(
        frame.docId,
        { type: "comment:added", cmtId: frame.cmtId, payload: frame.payload },
        context,
      );
      return;
    }
    if (frame.kind === "commentResolved") {
      await this.onMessage(
        frame.docId,
        { type: "comment:resolved", cmtId: frame.cmtId },
        context,
      );
      return;
    }
    if (frame.kind === "relay") {
      const key = this.encryptionKeys.get(frame.docId);
      if (!key) {
        return;
      }
      const message = await decryptRelayMessage(frame, key);
      if (
        message &&
        this.isCurrentGeneration(frame.docId, context.subscriptionId)
      ) {
        await this.onMessage(frame.docId, message, context);
      }
    }
  };

  private enqueueFrame(frame: ParsedFrame): void {
    if (frame.kind === "pong") {
      return;
    }
    const context = this.getFrameContext(frame);
    if (!context || frame.kind === "unknown") {
      return;
    }
    const queueKey = `${frame.docId}:${context.subscriptionId}`;
    const previous = this.messageQueues.get(queueKey) ?? Promise.resolve();
    const next = previous
      .catch((error: unknown) => {
        console.warn("[relay] previous queued frame failed:", error);
      })
      .then(() => this.processFrame(frame, context));
    this.messageQueues.set(queueKey, next);
    void next
      .catch((error: unknown) => {
        console.warn("[relay] failed to process queued frame:", error);
      })
      .finally(() => {
        if (this.messageQueues.get(queueKey) === next) {
          this.messageQueues.delete(queueKey);
        }
      });
  }

  private handleSocketMessage = (event: MessageEvent): void => {
    try {
      const rawText = typeof event.data === "string" ? event.data : "";
      const frameBytes = new TextEncoder().encode(rawText).byteLength;
      if (frameBytes > MAX_INBOUND_FRAME_BYTES) {
        recordRelayDiagnostic({
          kind: "rejection",
          docId: null,
          subscriptionId: null,
          role: null,
          frameType: null,
          frameBytes,
          phase: null,
          reason: "inbound frame too large",
        });
        return;
      }
      const rawData: unknown = JSON.parse(rawText);
      const frame = parseInboundFrame(rawData);
      if (frame.kind === "unknown") {
        recordRelayDiagnostic({
          kind: "rejection",
          docId: null,
          subscriptionId: null,
          role: null,
          frameType: null,
          frameBytes,
          phase: null,
          reason: "invalid frame shape",
        });
        return;
      }
      const context = this.getFrameContext(frame);
      recordRelayDiagnostic({
        kind: "frame",
        docId: frame.kind === "pong" ? null : frame.docId,
        subscriptionId: context?.subscriptionId ?? null,
        role: context?.role ?? null,
        frameType: frame.kind,
        frameBytes,
        phase: null,
        reason: null,
      });
      this.enqueueFrame(frame);
    } catch (error) {
      console.warn("[relay] failed to process message:", error);
    }
  };

  private handleSocketClose = (): void => {
    this.stopPingInterval();
    this.onStatusChange("disconnected");
    for (const [docId, meta] of this.subscriptionMeta) {
      this.notifySubscription(docId, meta, "failed", "Connection lost");
    }
    if (!this.closedIntentionally) {
      this.scheduleReconnect();
    }
  };

  private openConnection(): void {
    this.onStatusChange("connecting");
    this.socket = new WebSocket(this.wsUrl);
    this.socket.addEventListener("open", this.handleSocketOpen);
    this.socket.addEventListener("message", (event) => {
      void this.handleSocketMessage(event);
    });
    this.socket.addEventListener("close", this.handleSocketClose);
    this.socket.addEventListener("error", () => {
      this.socket?.close();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.backoff = Math.min(this.backoff * 2, 30000);
      this.openConnection();
    }, this.backoff);
  }

  subscribe(
    docId: string,
    key: CryptoKey,
    role: "host" | "peer",
    hostSecret?: string,
  ): string {
    const subscriptionId = crypto.randomUUID();
    const meta: SubscriptionMeta = {
      role,
      subscriptionId,
      ...(hostSecret ? { hostSecret } : {}),
    };
    this.encryptionKeys.set(docId, key);
    this.subscriptionMeta.set(docId, meta);
    this.confirmedSubscriptions.delete(docId);
    this.sendSubscribeFrame(docId, meta);
    return subscriptionId;
  }

  unsubscribe(docId: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      const subscriptionId = this.subscriptionMeta.get(docId)?.subscriptionId;
      this.socket.send(
        JSON.stringify({ type: "unsubscribe", docId, subscriptionId }),
      );
    }
    this.encryptionKeys.delete(docId);
    this.confirmedSubscriptions.delete(docId);
    this.subscriptionMeta.delete(docId);
    this.clearSnapshotAssemblies(docId);
  }

  sendCommentAdd(docId: string, cmtId: string, payload: string): void {
    if (
      this.socket?.readyState !== WebSocket.OPEN ||
      !this.confirmedSubscriptions.has(docId)
    ) {
      return;
    }
    const subscriptionId = this.confirmedSubscriptions.get(docId);
    this.socket.send(
      JSON.stringify({
        type: "comment:add",
        docId,
        cmtId,
        payload,
        subscriptionId,
      }),
    );
  }

  sendCommentResolve(docId: string, cmtId: string): void {
    if (
      this.socket?.readyState !== WebSocket.OPEN ||
      !this.confirmedSubscriptions.has(docId)
    ) {
      return;
    }
    const subscriptionId = this.confirmedSubscriptions.get(docId);
    this.socket.send(
      JSON.stringify({
        type: "comment:resolve",
        docId,
        cmtId,
        subscriptionId,
      }),
    );
  }

  async send(docId: string, message: RelayMessage): Promise<void> {
    const key = this.encryptionKeys.get(docId);
    if (!key) {
      throw new Error(`No encryption key for docId: ${docId}`);
    }
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    const encoded = new TextEncoder().encode(JSON.stringify(message));
    const encrypted = await encrypt(encoded, key);
    const payload = arrayBufferToBase64(encrypted);
    const subscriptionId = this.confirmedSubscriptions.get(docId);
    this.socket.send(
      JSON.stringify({ version: 1, docId, payload, subscriptionId }),
    );
  }

  hasActiveSubscriptions(): boolean {
    return this.subscriptionMeta.size > 0;
  }

  isSubscribed(docId: string): boolean {
    return this.confirmedSubscriptions.has(docId);
  }

  close(): void {
    this.closedIntentionally = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPingInterval();
    this.socket?.close();
    this.socket = null;
    this.encryptionKeys.clear();
    this.confirmedSubscriptions.clear();
    this.subscriptionMeta.clear();
    this.messageQueues.clear();
    this.snapshotAssemblies.clear();
    setRelay(null);
  }
}

function connectRelay(
  onMessage: (
    docId: string,
    event: RelayEvent,
    context: RelayEventContext,
  ) => Promise<void> | void,
  onStatusChange: (status: "connecting" | "connected" | "disconnected") => void,
): RelayConnection {
  const relay = new RelayConnectionImpl(onMessage, onStatusChange);
  setRelay(relay);
  return relay;
}

async function decryptPeerComment(
  encryptedPayload: string,
  key: CryptoKey,
  expectedCmtId: string,
): Promise<PeerComment> {
  if (
    encryptedPayloadByteLength(encryptedPayload) > MAX_ENCRYPTED_COMMENT_BYTES
  ) {
    throw new Error("Encrypted comment exceeds the 1 MiB safety limit");
  }
  const raw = Uint8Array.from(atob(encryptedPayload), (char) =>
    char.charCodeAt(0),
  );
  const decrypted = await decrypt(raw.buffer, key);
  const parsed: unknown = JSON.parse(new TextDecoder().decode(decrypted));
  if (!isPeerComment(parsed)) {
    throw new Error("Invalid peer comment shape");
  }
  if (parsed.id !== expectedCmtId) {
    throw new Error("Comment id mismatch between frame and payload");
  }
  return parsed;
}

function findEncryptionKey(
  docId: string,
  role: RelaySubscriptionRole,
): CryptoKey | undefined {
  const state = getRelayApplicationState();
  if (role === "peer") {
    return state.peerShareKeys[docId];
  }
  const owners = state.tabs.filter((tab) => tab.shareKeys[docId]);
  if (owners.length !== 1) {
    return undefined;
  }
  return owners[0].shareKeys[docId];
}

function findHostSecret(docId: string): string | undefined {
  const state = getRelayApplicationState();
  const records = state.tabs.flatMap((tab) =>
    tab.shares.filter((share) => share.docId === docId),
  );
  if (records.length !== 1) {
    return undefined;
  }
  return records[0].hostSecret;
}

function createShareStorage(): ShareStorage | null {
  if (!WORKER_URL) {
    return null;
  }
  return new ShareStorage(WORKER_URL);
}

function isRemoteContentNewer(
  loadedAt: string | null,
  remoteUpdatedAt: string | null,
): boolean {
  if (!remoteUpdatedAt) {
    return false;
  }
  if (!loadedAt) {
    return true;
  }
  const loadedTime = Date.parse(loadedAt);
  const remoteTime = Date.parse(remoteUpdatedAt);
  if (Number.isNaN(loadedTime) || Number.isNaN(remoteTime)) {
    return true;
  }
  return remoteTime > loadedTime;
}

async function decryptAndAddPendingComment(
  docId: string,
  cmtId: string,
  encryptedPayload: string,
  context: RelayEventContext,
): Promise<void> {
  const key = findEncryptionKey(docId, context.role);
  if (!key) {
    getRelayApplicationState().quarantinePendingComment(
      docId,
      cmtId,
      "Encryption key is unavailable",
    );
    return;
  }
  try {
    const comment = await decryptPeerComment(encryptedPayload, key, cmtId);
    getRelayApplicationState().addPendingComment(docId, comment);
  } catch (error) {
    console.warn("[relay] failed to decrypt comment:", error);
    getRelayApplicationState().quarantinePendingComment(
      docId,
      cmtId,
      error instanceof Error ? error.message : "Invalid encrypted comment",
    );
  }
}

async function decryptAndReplaceSnapshot(
  docId: string,
  entries: CommentsSnapshotEntry[],
  context: RelayEventContext,
): Promise<void> {
  const key = findEncryptionKey(docId, context.role);
  if (!key) {
    return;
  }
  const comments: PeerComment[] = [];
  for (const entry of entries) {
    try {
      const comment = await decryptPeerComment(entry.payload, key, entry.cmtId);
      comments.push(comment);
    } catch (error) {
      console.warn("[relay] failed to decrypt snapshot comment:", error);
      getRelayApplicationState().quarantinePendingComment(
        docId,
        entry.cmtId,
        error instanceof Error ? error.message : "Invalid snapshot comment",
      );
    }
  }
  getRelayApplicationState().replaceCommentsSnapshot(docId, comments);
}

async function refreshPeerContent(input?: { discardUnsubmitted?: boolean }) {
  const state = getRelayApplicationState();
  try {
    await state.loadSharedContent(input);
    getRelayApplicationState().dismissDocumentUpdate();
  } catch (error) {
    getRelayApplicationState().setDocumentUpdateAvailable(true);
    console.warn("[relay] peer content refresh failed:", error);
  }
}

export async function applyPeerDocumentUpdate(
  updatedAt: string | null,
): Promise<void> {
  const state = getRelayApplicationState();
  if (!state.isPeerMode || state.documentUpdateAvailable) {
    return;
  }
  if (!isRemoteContentNewer(state.peerLoadedUpdatedAt, updatedAt)) {
    return;
  }
  if (selectHasPeerLocalCommentWork(state)) {
    state.setDocumentUpdateAvailable(true);
    return;
  }
  await refreshPeerContent();
}

async function handleIncomingMessage(
  docId: string,
  event: RelayEvent,
  context: RelayEventContext,
): Promise<void> {
  const state = getRelayApplicationState();

  if (event.type === "comment:added") {
    if (context.role === "host") {
      await decryptAndAddPendingComment(
        docId,
        event.cmtId,
        event.payload,
        context,
      );
    }
    return;
  }

  if (event.type === "comments:snapshot") {
    if (context.role === "host") {
      await decryptAndReplaceSnapshot(docId, event.comments, context);
    }
    return;
  }

  if (event.type === "comment:add:ack") {
    if (context.role === "peer") {
      state.confirmPeerCommentSubmitted(event.cmtId);
    }
    return;
  }

  if (event.type === "comment:resolve:ack") {
    if (context.role === "host") {
      state.confirmPendingResolve(docId, event.cmtId);
    }
    return;
  }

  if (event.type === "comment:resolved") {
    if (context.role === "peer") {
      state.deletePeerComment(event.cmtId);
    }
    return;
  }

  if (event.type === "document:updated") {
    if (context.role === "peer") {
      await applyPeerDocumentUpdate(event.updatedAt);
    }
  }
}

export async function performReconnectCatchUp(): Promise<void> {
  const state = getRelayApplicationState();
  if (!state.isPeerMode || state.documentUpdateAvailable) {
    return;
  }
  const docId = state.peerActiveDocId;
  if (!docId) {
    return;
  }
  const storage = createShareStorage();
  if (!storage) {
    return;
  }
  try {
    const updatedAt = await storage.fetchLastModified(docId);
    await applyPeerDocumentUpdate(updatedAt);
  } catch (error) {
    console.warn("[relay] peer content catch-up failed:", error);
  }
}

function handleStatusChange(
  status: "connecting" | "connected" | "disconnected",
): void {
  getRelayApplicationState().setRelayStatus(status);
}

function handleSubscriptionState(
  docId: string,
  role: RelaySubscriptionRole,
  subscription: RelaySubscriptionState,
): void {
  const state = getRelayApplicationState();
  if (role === "peer") {
    state.setPeerSubmissionSubscription(subscription);
    return;
  }
  state.setIncomingReviewSubscription(docId, subscription);
}

function handleSubscribeConfirmed(
  docId: string,
  context: RelayEventContext,
): void {
  const state = getRelayApplicationState();
  if (context.role === "peer") {
    void performReconnectCatchUp();
    state.syncPeerComments().catch((error: unknown) => {
      console.warn("[relay] peer comment resend failed:", error);
    });
    return;
  }
  state.flushPendingCommentResolves(docId);
}

export function startRelay(): void {
  if (getRelay()) {
    return;
  }
  connectRelay(handleIncomingMessage, handleStatusChange);
}

function subscribeToDocWithRole(
  docId: string,
  role: RelaySubscriptionRole,
): void {
  const relay = getRelay();
  if (!relay) {
    return;
  }
  const key = findEncryptionKey(docId, role);
  if (!key) {
    console.warn("[relay] no key for docId:", docId);
    return;
  }
  if (role === "peer") {
    relay.subscribe(docId, key, "peer");
    return;
  }
  const hostSecret = findHostSecret(docId);
  if (!hostSecret) {
    console.warn("[relay] missing hostSecret for docId:", docId);
    return;
  }
  relay.subscribe(docId, key, "host", hostSecret);
}

export function subscribeToDoc(docId: string): void {
  const role: RelaySubscriptionRole = getRelayApplicationState().isPeerMode
    ? "peer"
    : "host";
  subscribeToDocWithRole(docId, role);
}

export function unsubscribeFromDoc(docId: string): void {
  const relay = getRelay();
  if (relay) {
    relay.unsubscribe(docId);
  }
  if (relay && !relay.hasActiveSubscriptions()) {
    stopRelay();
  }
}

export function stopRelay(): void {
  const relay = getRelay();
  if (relay) {
    relay.close();
  }
  getRelayApplicationState().setRelayStatus("disconnected");
}

export function isDocSubscribed(docId: string): boolean {
  const relay = getRelay();
  if (!relay) {
    return false;
  }
  return relay.isSubscribed(docId);
}

export function ensureRelaySubscriptions(
  shares: ReadonlyArray<{ docId: string; expiresAt: string }>,
): void {
  const now = new Date();
  const activeShares = shares.filter(
    (share) => new Date(share.expiresAt) > now,
  );
  if (activeShares.length === 0) {
    return;
  }
  startRelay();
  for (const share of activeShares) {
    subscribeToDocWithRole(share.docId, "host");
  }
}

export function startRelayForDoc(
  docId: string,
  role?: RelaySubscriptionRole,
): void {
  startRelay();
  subscribeToDocWithRole(
    docId,
    role ?? (getRelayApplicationState().isPeerMode ? "peer" : "host"),
  );
}

export function relayCommentResolve(docId: string, cmtId: string): void {
  const relay = getRelay();
  if (relay) {
    relay.sendCommentResolve(docId, cmtId);
  }
}

export async function relayCommentAdd(
  docId: string,
  cmtId: string,
  comment: PeerComment,
  key: CryptoKey,
): Promise<void> {
  const relay = getRelay();
  if (!relay) {
    return;
  }
  const encoded = new TextEncoder().encode(JSON.stringify(comment));
  const encrypted = await encrypt(encoded, key);
  const payload = arrayBufferToBase64(encrypted);
  relay.sendCommentAdd(docId, cmtId, payload);
}
