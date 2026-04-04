import { encrypt, decrypt } from "./crypto";
import type { RelayMessage } from "../types/relay";
import type { PeerComment } from "../types/share";
import { useAppStore } from "../store";
import { WORKER_URL } from "../config";

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
  activeSubscriptions: Set<string>;
  socket: WebSocket | null;
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
let activeSubscriptions = new Set<string>();
let encryptionKeys = new Map<string, CryptoKey>();

export function getRelay(): RelayConnection | null {
  return activeRelay;
}

function setRelay(relay: RelayConnection | null): void {
  activeRelay = relay;
}

function connectRelay(
  onMessage: (docId: string, message: RelayMessage) => void,
  onStatusChange: (status: "connecting" | "connected" | "disconnected") => void,
): RelayConnection {
  if (!WORKER_URL) {
    throw new Error("Worker URL not configured");
  }

  const wsUrl = WORKER_URL.replace(/^http/, "ws") + "/relay";
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

  function handleSocketOpen(): void {
    if (closedIntentionally) {
      socket?.close();
      return;
    }
    backoff = 1000;
    onStatusChange("connected");
    startPingInterval();
    resubscribeAll();
    flushBatch();
  }

  function resubscribeAll(): void {
    for (const docId of activeSubscriptions) {
      if (socket) {
        socket.send(JSON.stringify({ type: "subscribe", docId }));
      }
    }
  }

  async function handleSocketMessage(event: MessageEvent): Promise<void> {
    try {
      const rawData = JSON.parse(
        typeof event.data === "string" ? event.data : "",
      );
      const frame = parseInboundFrame(rawData);
      if (frame.kind === "unknown") {
        return;
      }
      if (handleControlFrame(frame, { activeSubscriptions, socket })) {
        return;
      }
      await decryptAndDispatch(frame, encryptionKeys, onMessage);
    } catch (error) {
      console.warn("[relay] failed to process message:", error);
    }
  }

  function handleSocketClose(): void {
    stopPingInterval();
    onStatusChange("disconnected");
    if (!closedIntentionally) {
      scheduleReconnect();
    }
  }

  function openConnection(): void {
    onStatusChange("connecting");
    socket = new WebSocket(wsUrl);
    socket.addEventListener("open", handleSocketOpen);
    socket.addEventListener("message", handleSocketMessage);
    socket.addEventListener("close", handleSocketClose);
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
      encryptionKeys.set(docId, key);
      activeSubscriptions.add(docId);
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "subscribe", docId }));
      }
    },

    unsubscribe(docId: string) {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "unsubscribe", docId }));
      }
      encryptionKeys.delete(docId);
      activeSubscriptions.delete(docId);
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
      closedIntentionally = true;
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
      setRelay(null);
    },
  };

  setRelay(relay);
  return relay;
}

// ── Message routing ───────────────────────────────────────────────────

function handleIncomingMessage(docId: string, message: RelayMessage): void {
  const state = useAppStore.getState();

  if (message.type === "comment:added") {
    if (state.isPeerMode) {
      // Peer mode: not applicable — peers see only their own comments
      return;
    }
    // Host mode: add to pending comments on the owning tab
    state.addPendingComment(docId, message.comment);
    return;
  }

  if (message.type === "comment:resolved") {
    if (state.isPeerMode) {
      // Peer receives host resolve — remove the comment locally
      state.deletePeerComment(message.commentId);
    }
    return;
  }

  if (message.type === "document:updated") {
    if (state.isPeerMode) {
      state.setDocumentUpdateAvailable(true);
    }
    return;
  }
}

// ── Status change + reconnect catch-up ────────────────────────────────

function handleStatusChange(
  status: "connecting" | "connected" | "disconnected",
): void {
  useAppStore.getState().setRelayStatus(status);
  if (status === "connected") {
    performReconnectCatchUp();
  }
}

function performReconnectCatchUp(): void {
  const state = useAppStore.getState();
  if (state.isPeerMode) {
    state.loadSharedContent().catch((error: unknown) => {
      console.warn("[relay] peer content catch-up failed:", error);
    });
  } else {
    state.fetchAllPendingComments().catch((error: unknown) => {
      console.warn("[relay] host reconnect catch-up failed:", error);
    });
  }
}

// ── Public orchestration API ──────────────────────────────────────────

/** Start the relay connection. No-op if already connected. */
export function startRelay(): void {
  if (getRelay()) {
    return;
  }
  connectRelay(handleIncomingMessage, handleStatusChange);
}

/** Subscribe a document to the relay, finding its encryption key from the store. */
export function subscribeToDoc(docId: string): void {
  const relay = getRelay();
  if (!relay) {
    return;
  }
  const key = findEncryptionKey(docId);
  if (!key) {
    console.warn("[relay] no key for docId:", docId);
    return;
  }
  relay.subscribe(docId, key);
}

function findEncryptionKey(docId: string): CryptoKey | undefined {
  const state = useAppStore.getState();
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

  // Close relay if no subscriptions remain
  if (relay && !relay.hasActiveSubscriptions()) {
    stopRelay();
  }
}

/** Close the relay and clear all subscription state. */
export function stopRelay(): void {
  const relay = getRelay();
  if (relay) {
    relay.close(); // close() internally clears the module-level singleton
  }
  useAppStore.getState().setRelayStatus("disconnected");
}
