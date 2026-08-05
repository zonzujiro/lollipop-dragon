import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const decryptedComments = new Map<string, string>();
let releaseSlowDecrypt = (): void => undefined;
let slowDecrypt = Promise.resolve();

vi.mock("../../../services/crypto", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../services/crypto")>();
  return {
    ...actual,
    decrypt: vi.fn(async (buffer: ArrayBuffer) => {
      const marker = new TextDecoder().decode(buffer);
      if (marker === "slow") {
        await slowDecrypt;
      }
      const commentJson = decryptedComments.get(marker);
      if (!commentJson) {
        throw new Error("Unknown encrypted test marker");
      }
      return new TextEncoder().encode(commentJson).buffer;
    }),
  };
});

vi.mock("../../../config", () => ({
  WORKER_URL: "https://mock-worker.test",
}));

import { generateKey } from "../../../services/crypto";
import { startRelayForDoc, stopRelay, subscribeToDoc } from "../controller";
import { useAppStore } from "../../../store";
import {
  makePeerComment,
  makeShare,
  resetTestStore,
  setTestState,
} from "../../../testing/testHelpers";

function parseFrame(message: string): Record<string, unknown> {
  const value: unknown = JSON.parse(message);
  if (typeof value !== "object" || value === null) {
    throw new Error("Expected object frame");
  }
  return value;
}

class OrderingWebSocket extends EventTarget {
  static readonly OPEN = 1;

  static latest: OrderingWebSocket | null = null;

  readyState = 0;

  sent: string[] = [];

  constructor(readonly url: string) {
    super();
    OrderingWebSocket.latest = this;
  }

  send(message: string): void {
    this.sent.push(message);
  }

  close(): void {
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent("close"));
  }

  open(): void {
    this.readyState = OrderingWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  receive(frame: Record<string, unknown>): void {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(frame) }),
    );
  }

  latestSubscriptionId(): string {
    const subscribeFrames = this.sent
      .map(parseFrame)
      .filter((frame) => frame["type"] === "subscribe");
    const subscriptionId = subscribeFrames.at(-1)?.["subscriptionId"];
    if (typeof subscriptionId !== "string") {
      throw new Error("Expected subscription id");
    }
    return subscriptionId;
  }
}

function markerPayload(marker: string): string {
  return btoa(marker);
}

beforeEach(async () => {
  resetTestStore();
  decryptedComments.clear();
  slowDecrypt = new Promise<void>((resolve) => {
    releaseSlowDecrypt = resolve;
  });
  vi.stubGlobal("WebSocket", OrderingWebSocket);
  const key = await generateKey();
  setTestState(
    {
      shares: [makeShare()],
      shareKeys: { "doc-1": key },
    },
    { isPeerMode: false },
  );
});

afterEach(() => {
  releaseSlowDecrypt();
  stopRelay();
  vi.unstubAllGlobals();
  OrderingWebSocket.latest = null;
});

describe("relay subscription ordering", () => {
  it("reassembles a chunked snapshot before marking the host subscription live", async () => {
    const firstComment = makePeerComment({ id: "first-comment" });
    const secondComment = makePeerComment({ id: "second-comment" });
    decryptedComments.set("first", JSON.stringify(firstComment));
    decryptedComments.set("second", JSON.stringify(secondComment));

    startRelayForDoc("doc-1", "host");
    const socket = OrderingWebSocket.latest;
    if (!socket) {
      throw new Error("Expected relay socket");
    }
    socket.open();
    const subscriptionId = socket.latestSubscriptionId();
    socket.receive({ type: "subscribe:ok", docId: "doc-1", subscriptionId });
    socket.receive({
      type: "comments:snapshot",
      docId: "doc-1",
      subscriptionId,
      snapshotId: "snapshot-1",
      chunkIndex: 0,
      chunkCount: 2,
      comments: [{ cmtId: firstComment.id, payload: markerPayload("first") }],
    });

    await waitFor(() => {
      const tab = useAppStore
        .getState()
        .tabs.find((item) => item.id === "test-tab");
      expect(tab?.incomingReviewSessions["doc-1"]?.subscription.phase).toBe(
        "syncing",
      );
      expect(tab?.pendingComments["doc-1"]).toBeUndefined();
    });

    socket.receive({
      type: "comments:snapshot",
      docId: "doc-1",
      subscriptionId,
      snapshotId: "snapshot-1",
      chunkIndex: 1,
      chunkCount: 2,
      comments: [{ cmtId: secondComment.id, payload: markerPayload("second") }],
    });

    await waitFor(() => {
      const tab = useAppStore
        .getState()
        .tabs.find((item) => item.id === "test-tab");
      expect(
        tab?.pendingComments["doc-1"]?.map((comment) => comment.id),
      ).toEqual([firstComment.id, secondComment.id]);
      expect(tab?.incomingReviewSessions["doc-1"]?.subscription.phase).toBe(
        "live",
      );
    });
  });

  it("applies a snapshot before a later live comment for the same generation", async () => {
    const snapshotComment = makePeerComment({ id: "snapshot-comment" });
    const liveComment = makePeerComment({ id: "live-comment" });
    decryptedComments.set("slow", JSON.stringify(snapshotComment));
    decryptedComments.set("fast", JSON.stringify(liveComment));

    startRelayForDoc("doc-1", "host");
    const socket = OrderingWebSocket.latest;
    if (!socket) {
      throw new Error("Expected relay socket");
    }
    socket.open();
    const subscriptionId = socket.latestSubscriptionId();
    socket.receive({
      type: "subscribe:ok",
      docId: "doc-1",
      subscriptionId,
    });
    socket.receive({
      type: "comments:snapshot",
      docId: "doc-1",
      subscriptionId,
      comments: [{ cmtId: snapshotComment.id, payload: markerPayload("slow") }],
    });
    socket.receive({
      type: "comment:added",
      docId: "doc-1",
      subscriptionId,
      cmtId: liveComment.id,
      payload: markerPayload("fast"),
    });

    releaseSlowDecrypt();

    await waitFor(() => {
      const tab = useAppStore
        .getState()
        .tabs.find((item) => item.id === "test-tab");
      expect(
        tab?.pendingComments["doc-1"]?.map((comment) => comment.id),
      ).toEqual([snapshotComment.id, liveComment.id]);
      expect(tab?.incomingReviewSessions["doc-1"]?.subscription.phase).toBe(
        "live",
      );
    });
  });

  it("ignores events from a superseded subscription generation", async () => {
    const staleComment = makePeerComment({ id: "stale-comment" });
    decryptedComments.set("fast", JSON.stringify(staleComment));

    startRelayForDoc("doc-1", "host");
    const socket = OrderingWebSocket.latest;
    if (!socket) {
      throw new Error("Expected relay socket");
    }
    socket.open();
    const oldSubscriptionId = socket.latestSubscriptionId();
    subscribeToDoc("doc-1");
    const currentSubscriptionId = socket.latestSubscriptionId();
    expect(currentSubscriptionId).not.toBe(oldSubscriptionId);

    socket.receive({
      type: "comment:added",
      docId: "doc-1",
      subscriptionId: oldSubscriptionId,
      cmtId: staleComment.id,
      payload: markerPayload("fast"),
    });
    socket.receive({
      type: "subscribe:ok",
      docId: "doc-1",
      subscriptionId: currentSubscriptionId,
    });
    socket.receive({
      type: "comments:snapshot",
      docId: "doc-1",
      subscriptionId: currentSubscriptionId,
      comments: [],
    });

    await waitFor(() => {
      const tab = useAppStore
        .getState()
        .tabs.find((item) => item.id === "test-tab");
      expect(tab?.pendingComments["doc-1"]).toBeUndefined();
      expect(
        tab?.incomingReviewSessions["doc-1"]?.subscription.subscriptionId,
      ).toBe(currentSubscriptionId);
    });
  });

  it("keeps a confirmed subscription live after an operation-level rejection", async () => {
    startRelayForDoc("doc-1", "host");
    const socket = OrderingWebSocket.latest;
    if (!socket) {
      throw new Error("Expected relay socket");
    }
    socket.open();
    const subscriptionId = socket.latestSubscriptionId();
    socket.receive({
      type: "subscribe:ok",
      docId: "doc-1",
      subscriptionId,
    });
    socket.receive({
      type: "comments:snapshot",
      docId: "doc-1",
      subscriptionId,
      comments: [],
    });
    socket.receive({
      type: "error",
      docId: "doc-1",
      subscriptionId,
      scope: "operation",
      cmtId: "c-too-large",
      message: "Comment payload too large",
    });

    await waitFor(() => {
      const tab = useAppStore
        .getState()
        .tabs.find((item) => item.id === "test-tab");
      expect(tab?.incomingReviewSessions["doc-1"]?.subscription.phase).toBe(
        "live",
      );
      expect(useAppStore.getState().relayStatus).toBe("connected");
      expect(useAppStore.getState().toast).toBe("Comment payload too large");
    });
  });
});
