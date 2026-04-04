import { encrypt, decrypt } from "./crypto";
import type { RelayMessage } from "../types/relay";
import type { PeerComment } from "../types/share";
import { WORKER_URL } from "../config";
import { ShareStorage } from "./shareStorage";

export interface RelayConnection {
  subscribe(docId: string, key: CryptoKey): void;
  unsubscribe(docId: string): void;
  send(docId: string, message: RelayMessage): Promise<void>;
  close(): void;
  hasActiveSubscriptions(): boolean;
}

const VALID_RELAY_TYPES = new Set([
  "comment:added",
  "comment:resolved",
  "document:updated",
]);

const BASE64_CHUNK_SIZE = 8192;

function isValidRelayMessage(value: unknown): value is RelayMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "type" in value &&
    typeof value.type === "string" &&
    VALID_RELAY_TYPES.has(value.type)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ── Inbound frame parser ──────────────────────────────────────────────
// Validates raw JSON once at the boundary and returns a typed structure.
// This avoids scattering `typeof x === "string"` checks through handlers.

type ParsedFrame =
  | { kind: "pong" }
  | { kind: "error"; docId: string; message: string }
  | { kind: "subscribeOk"; docId: string }
  | { kind: "relay"; docId: string; payload: string }
  | { kind: "unknown" };

function parseInboundFrame(raw: unknown): ParsedFrame {
  if (!isRecord(raw)) {
    return { kind: "unknown" };
  }
  if (raw.type === "pong") {
    return { kind: "pong" };
  }
  if (raw.type === "error" && typeof raw.docId === "string") {
    return {
      kind: "error",
      docId: raw.docId,
      message: String(raw.message ?? ""),
    };
  }
  if (raw.type === "subscribe:ok" && typeof raw.docId === "string") {
    return { kind: "subscribeOk", docId: raw.docId };
  }
  if (
    raw.version === 1 &&
    typeof raw.docId === "string" &&
    typeof raw.payload === "string"
  ) {
    return { kind: "relay", docId: raw.docId, payload: raw.payload };
  }
  return { kind: "unknown" };
}

interface RelayContext {
  confirmedSubscriptions: Set<string>;
  activeSubscriptions: Set<string>;
  socket: WebSocket | null;
  onSubscribeResult: (docId: string, ok: boolean) => void;
}

function handleControlFrame(
  frame: ParsedFrame,
  context: RelayContext,
): boolean {
  if (frame.kind === "pong") {
    return true;
  }

  if (frame.kind === "error") {
    console.warn(
      "[relay] server error for docId",
      frame.docId,
      ":",
      frame.message,
    );
    context.onSubscribeResult(frame.docId, false);
    if (context.activeSubscriptions.has(frame.docId)) {
      const retryDocId = frame.docId;
      setTimeout(() => {
        if (
          context.socket?.readyState === WebSocket.OPEN &&
          context.activeSubscriptions.has(retryDocId)
        ) {
          context.socket.send(
            JSON.stringify({ type: "subscribe", docId: retryDocId }),
          );
        }
      }, 5000);
    }
    return true;
  }

  if (frame.kind === "subscribeOk") {
    context.confirmedSubscriptions.add(frame.docId);
    context.onSubscribeResult(frame.docId, true);
    return true;
  }

  return false;
}

async function decryptAndDispatch(
  frame: ParsedFrame,
  encryptionKeys: Map<string, CryptoKey>,
  onMessage: (docId: string, message: RelayMessage) => void,
): Promise<void> {
  if (frame.kind !== "relay") {
    return;
  }

  const key = encryptionKeys.get(frame.docId);
  if (!key) {
    return;
  }

  const raw = Uint8Array.from(atob(frame.payload), (char) =>
    char.charCodeAt(0),
  );
  const decrypted = await decrypt(raw.buffer, key);
  const parsed: unknown = JSON.parse(new TextDecoder().decode(decrypted));
  if (!isValidRelayMessage(parsed)) {
    console.warn("[relay] invalid message shape, discarding");
    return;
  }
  onMessage(frame.docId, parsed);
}

/** Convert an ArrayBuffer to a base64 string without hitting stack size limits. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    const slice = bytes.subarray(offset, offset + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

// ── Module-level relay singleton ──────────────────────────────────────────────
// The relay connection is a mutable non-serializable object, so it must NOT
// live in the Zustand store. It is managed here as a module-level singleton.
// `connectRelay` sets the active relay; `close()` clears it.

let activeRelay: RelayConnection | null = null;

export function getRelay(): RelayConnection | null {
  return activeRelay;
}

function setRelay(relay: RelayConnection | null): void {
  activeRelay = relay;
}

/** Exported only for tests that need to inject a mock relay. */
export function setRelayForTesting(relay: RelayConnection | null): void {
  activeRelay = relay;
}

export function connectRelay(
  onMessage: (docId: string, message: RelayMessage) => void,
  onStatusChange: (status: "connecting" | "connected" | "disconnected") => void,
  onSubscribeResult: (docId: string, ok: boolean) => void,
): RelayConnection {
  if (!WORKER_URL) {
    throw new Error("Worker URL not configured");
  }

  const wsUrl = WORKER_URL.replace(/^http/, "ws") + "/relay";
  const encryptionKeys = new Map<string, CryptoKey>(); // docId → encryption key
  const activeSubscriptions = new Set<string>(); // docIds to subscribe on (re)connect
  const confirmedSubscriptions = new Set<string>(); // docIds confirmed by DO
  let socket: WebSocket | null = null;
  let backoff = 1000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let closedIntentionally = false;

  // --- Debouncing ---
  let outboundBatch: Array<{ version: 1; docId: string; payload: string }> = [];
  let batchTimer: ReturnType<typeof setTimeout> | null = null;
  const BATCH_INTERVAL_MS = 500;
  const PING_INTERVAL_MS = 30_000;

  function flushBatch(): void {
    batchTimer = null; // Always clear the timer reference first
    if (
      outboundBatch.length === 0 ||
      !socket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      return;
    }
    for (const frame of outboundBatch) {
      socket.send(JSON.stringify(frame));
    }
    outboundBatch = [];
  }

  function startPingInterval(): void {
    stopPingInterval();
    pingInterval = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "ping" }));
      }
    }, PING_INTERVAL_MS);
  }

  function stopPingInterval(): void {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  }

  function openConnection(): void {
    onStatusChange("connecting");
    socket = new WebSocket(wsUrl);

    socket.addEventListener("open", () => {
      if (closedIntentionally) {
        socket?.close();
        return;
      }
      backoff = 1000;
      onStatusChange("connected");
      startPingInterval();
      // Re-subscribe to all active docIds
      for (const docId of activeSubscriptions) {
        if (socket) {
          socket.send(JSON.stringify({ type: "subscribe", docId }));
        }
      }
      // Flush any messages that were queued while disconnected
      flushBatch();
    });

    socket.addEventListener("message", async (event) => {
      try {
        const raw = JSON.parse(
          typeof event.data === "string" ? event.data : "",
        );
        const frame = parseInboundFrame(raw);
        if (frame.kind === "unknown") {
          return;
        }
        if (
          handleControlFrame(frame, {
            confirmedSubscriptions,
            activeSubscriptions,
            socket,
            onSubscribeResult,
          })
        ) {
          return;
        }
        await decryptAndDispatch(frame, encryptionKeys, onMessage);
      } catch (error) {
        console.warn("[relay] failed to process message:", error);
      }
    });

    socket.addEventListener("close", () => {
      stopPingInterval();
      onStatusChange("disconnected");
      if (!closedIntentionally) {
        scheduleReconnect();
      }
    });

    socket.addEventListener("error", () => {
      socket?.close();
    });
  }

  function scheduleReconnect(): void {
    if (reconnectTimer) {
      return;
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      backoff = Math.min(backoff * 2, 30000);
      openConnection();
    }, backoff);
  }

  openConnection();

  const relay: RelayConnection = {
    subscribe(docId: string, key: CryptoKey) {
      // Always add to activeSubscriptions first — if the socket is closed,
      // the openConnection() handler will send all activeSubscriptions
      // on the next successful (re)connect.
      // The subscription is not considered confirmed until the DO sends
      // back a subscribe:ok frame, which adds it to confirmedSubscriptions.
      encryptionKeys.set(docId, key);
      activeSubscriptions.add(docId);
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "subscribe", docId }));
      }
    },

    unsubscribe(docId: string) {
      // Send to DO first (if connected), then remove from local tracking.
      // This ordering matters: if the socket is closed, the unsubscribe
      // frame is lost — but removing from activeSubscriptions ensures
      // the reconnect loop won't re-subscribe to this docId.
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "unsubscribe", docId }));
      }
      encryptionKeys.delete(docId);
      activeSubscriptions.delete(docId);
      confirmedSubscriptions.delete(docId);
    },

    async send(docId: string, message: RelayMessage) {
      const key = encryptionKeys.get(docId);
      if (!key) {
        throw new Error(`No encryption key for docId: ${docId}`);
      }
      const encoded = new TextEncoder().encode(JSON.stringify(message));
      const encrypted = await encrypt(encoded, key);
      const payload = arrayBufferToBase64(encrypted);
      outboundBatch.push({ version: 1, docId, payload });
      if (!batchTimer) {
        batchTimer = setTimeout(flushBatch, BATCH_INTERVAL_MS);
      }
    },

    hasActiveSubscriptions() {
      return activeSubscriptions.size > 0;
    },

    close() {
      // Mark as intentional so the close event handler does not reconnect
      closedIntentionally = true;
      // Flush any pending outbound messages before tearing down
      flushBatch();

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (batchTimer) {
        clearTimeout(batchTimer);
      }
      stopPingInterval();
      socket?.close();
      socket = null;
      encryptionKeys.clear();
      activeSubscriptions.clear();
      confirmedSubscriptions.clear();
      setRelay(null);
    },
  };

  setRelay(relay);
  return relay;
}

// ── Relay orchestration ───────────────────────────────────────────────
// Side-effect coordination that reads/writes the Zustand store.
// The store registers itself via `registerRelayStoreAccessor` at init time
// to avoid circular imports (store imports connectRelay from this module).

/** Minimal store surface the relay service needs for orchestration. */
export interface RelayStoreAccessor {
  isPeerMode: boolean;
  peerActiveDocId: string | null;
  peerShareKeys: Record<string, CryptoKey>;
  myPeerComments: PeerComment[];
  submittedPeerCommentIds: string[];
  remotePeerComments: PeerComment[];
  resolvedCommentIds: Map<string, Set<string>>;
  rtSubscriptions: Set<string>;
  tabs: Array<{
    shares: Array<{ docId: string; keyB64: string; expiresAt: string }>;
    shareKeys: Record<string, CryptoKey>;
  }>;
  setRtStatus: (status: "disconnected" | "connecting" | "connected") => void;
  setRtSubscriptions: (subs: Set<string>) => void;
  addRemotePeerComments: (comments: PeerComment[]) => void;
  applyPeerMessagePatch: (docId: string, message: RelayMessage) => void;
  applyHostMessage: (docId: string, message: RelayMessage) => void;
  addRtSubscription: (docId: string) => void;
  loadSharedContent: () => Promise<void>;
  fetchAllPendingComments: () => Promise<void>;
}

let storeAccessor: (() => RelayStoreAccessor) | null = null;

/** Called once by the store module to provide access without circular imports. */
export function registerRelayStoreAccessor(
  accessor: () => RelayStoreAccessor,
): void {
  storeAccessor = accessor;
}

function getStoreState(): RelayStoreAccessor {
  if (!storeAccessor) {
    throw new Error(
      "[relay] Store accessor not registered. Call registerRelayStoreAccessor() first.",
    );
  }
  return storeAccessor();
}

function getStorage(): ShareStorage | null {
  return WORKER_URL ? new ShareStorage(WORKER_URL) : null;
}

// ── Message routing ───────────────────────────────────────────────────

function handleIncomingMessage(docId: string, message: RelayMessage): void {
  const state = getStoreState();
  if (state.isPeerMode) {
    state.applyPeerMessagePatch(docId, message);
  } else {
    state.applyHostMessage(docId, message);
  }
}

// ── Status change + reconnect catch-up ────────────────────────────────

function handleStatusChange(
  status: "connecting" | "connected" | "disconnected",
): void {
  getStoreState().setRtStatus(status);
  if (status === "connected") {
    performReconnectCatchUp();
  }
}

function performReconnectCatchUp(): void {
  const state = getStoreState();
  if (state.isPeerMode) {
    performPeerCatchUp(state);
  } else {
    performHostCatchUp(state);
  }
}

function performPeerCatchUp(state: RelayStoreAccessor): void {
  const peerDocId = state.peerActiveDocId;
  const peerKey = peerDocId ? state.peerShareKeys[peerDocId] : null;
  if (peerDocId && peerKey) {
    fetchMissedPeerComments(peerDocId, peerKey);
  }
  state.loadSharedContent().catch((error: unknown) => {
    console.warn("[relay] peer content catch-up failed:", error);
  });
}

function fetchMissedPeerComments(peerDocId: string, peerKey: CryptoKey): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  storage
    .fetchComments(peerDocId, peerKey)
    .then((comments: PeerComment[]) => {
      const latestState = getStoreState();
      const ownIds = new Set(
        latestState.myPeerComments.map((comment) => comment.id),
      );
      const submittedIds = new Set(latestState.submittedPeerCommentIds);
      const remoteIds = new Set(
        latestState.remotePeerComments.map((comment) => comment.id),
      );
      const newComments = comments.filter(
        (comment) =>
          !ownIds.has(comment.id) &&
          !submittedIds.has(comment.id) &&
          !remoteIds.has(comment.id) &&
          !latestState.resolvedCommentIds.get(peerDocId)?.has(comment.id),
      );
      if (newComments.length > 0) {
        latestState.addRemotePeerComments(newComments);
      }
    })
    .catch((error: unknown) => {
      console.warn("[relay] peer comment catch-up failed:", error);
    });
}

function performHostCatchUp(state: RelayStoreAccessor): void {
  // KNOWN LIMITATION (v1): Only catches up the active tab's shares.
  // Background tabs recover when the user switches to them.
  // See spec section 5.3 and section 9 for details.
  state.fetchAllPendingComments().catch((error: unknown) => {
    console.warn("[relay] host reconnect catch-up failed:", error);
  });
}

// ── Subscribe result handler ──────────────────────────────────────────

function handleSubscribeResult(docId: string, ok: boolean): void {
  if (ok) {
    getStoreState().addRtSubscription(docId);
  }
}

// ── Public orchestration API ──────────────────────────────────────────

/** Start the relay connection. No-op if already connected. */
export function startRelay(): void {
  if (getRelay()) {
    return;
  }
  connectRelay(
    handleIncomingMessage,
    handleStatusChange,
    handleSubscribeResult,
  );
  // connectRelay() internally sets the module-level singleton via setRelay()
}

/** Subscribe a document to the relay, finding its encryption key from the store. */
export function subscribeToDoc(docId: string): void {
  const relay = getRelay();
  if (!relay) {
    return;
  }
  const state = getStoreState();
  const key = findEncryptionKey(state, docId);
  if (!key) {
    console.warn("[relay] no key for docId:", docId);
    return;
  }
  relay.subscribe(docId, key);
}

function findEncryptionKey(
  state: RelayStoreAccessor,
  docId: string,
): CryptoKey | undefined {
  if (state.isPeerMode) {
    return state.peerShareKeys[docId];
  }
  for (const tab of state.tabs) {
    if (tab.shareKeys[docId]) {
      return tab.shareKeys[docId];
    }
  }
  return undefined;
}

/** Unsubscribe a document. Closes the relay if no subscriptions remain. */
export function unsubscribeFromDoc(docId: string): void {
  const relay = getRelay();
  if (relay) {
    relay.unsubscribe(docId);
  }
  const state = getStoreState();
  const { rtSubscriptions } = state;
  const next = new Set(rtSubscriptions);
  next.delete(docId);
  state.setRtSubscriptions(next);

  // Close relay if no subscriptions remain
  if (next.size === 0 && relay && !relay.hasActiveSubscriptions()) {
    stopRelay();
  }
}

/** Close the relay and clear all subscription state. */
export function stopRelay(): void {
  const relay = getRelay();
  if (relay) {
    relay.close(); // close() internally clears the module-level singleton
  }
  const state = getStoreState();
  state.setRtStatus("disconnected");
  state.setRtSubscriptions(new Set());
}
