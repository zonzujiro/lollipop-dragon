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
  isSubscribed(docId: string): boolean;
}

const VALID_RELAY_TYPES = new Set([
  "comment:added",
  "comment:resolved",
  "document:updated",
]);

/** Max bytes per String.fromCharCode spread to avoid exceeding the call-stack limit. */
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
  subscriptions: Set<string>;
  socket: WebSocket | null;
}

function scheduleSubscriptionRetry(context: RelayContext, docId: string): void {
  if (!context.subscriptions.has(docId)) {
    return;
  }
  const retryDocId = docId;
  setTimeout(() => {
    if (
      context.socket?.readyState === WebSocket.OPEN &&
      context.subscriptions.has(retryDocId)
    ) {
      context.socket.send(
        JSON.stringify({ type: "subscribe", docId: retryDocId }),
      );
    }
  }, 5000);
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
    scheduleSubscriptionRetry(context, frame.docId);
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

export function getRelay(): RelayConnection | null {
  return activeRelay;
}

function setRelay(relay: RelayConnection | null): void {
  activeRelay = relay;
}

type OutboundFrame = { version: 1; docId: string; payload: string };

const BATCH_INTERVAL_MS = 500;
const PING_INTERVAL_MS = 30_000;

class RelayConnectionImpl implements RelayConnection {
  private socket: WebSocket | null = null;
  private backoff = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private closedIntentionally = false;
  private outboundBatch: OutboundFrame[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private wsUrl: string;
  private subscriptions = new Set<string>();
  private encryptionKeys = new Map<string, CryptoKey>();

  constructor(
    private onMessage: (docId: string, message: RelayMessage) => void,
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

  // ── Private helpers ──────────────────────────────────────────────────

  private flushBatch(): void {
    this.batchTimer = null;
    if (
      this.outboundBatch.length === 0 ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return;
    }
    for (const frame of this.outboundBatch) {
      this.socket.send(JSON.stringify(frame));
    }
    this.outboundBatch = [];
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
    this.onStatusChange("connected");
    this.startPingInterval();
    this.resubscribeAll();
    this.flushBatch();
  };

  private resubscribeAll(): void {
    for (const docId of this.subscriptions) {
      if (this.socket) {
        this.socket.send(JSON.stringify({ type: "subscribe", docId }));
      }
    }
  }

  private handleSocketMessage = async (event: MessageEvent): Promise<void> => {
    try {
      const rawData = JSON.parse(
        typeof event.data === "string" ? event.data : "",
      );
      const frame = parseInboundFrame(rawData);
      if (frame.kind === "unknown") {
        return;
      }
      const context: RelayContext = {
        subscriptions: this.subscriptions,
        socket: this.socket,
      };
      if (handleControlFrame(frame, context)) {
        return;
      }
      await decryptAndDispatch(frame, this.encryptionKeys, this.onMessage);
    } catch (error) {
      console.warn("[relay] failed to process message:", error);
    }
  };

  private handleSocketClose = (): void => {
    this.stopPingInterval();
    this.onStatusChange("disconnected");
    if (!this.closedIntentionally) {
      this.scheduleReconnect();
    }
  };

  private openConnection(): void {
    this.onStatusChange("connecting");
    this.socket = new WebSocket(this.wsUrl);
    this.socket.addEventListener("open", this.handleSocketOpen);
    this.socket.addEventListener("message", this.handleSocketMessage);
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

  // ── Public interface ─────────────────────────────────────────────────

  subscribe(docId: string, key: CryptoKey): void {
    this.encryptionKeys.set(docId, key);
    this.subscriptions.add(docId);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "subscribe", docId }));
    }
  }

  unsubscribe(docId: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "unsubscribe", docId }));
    }
    this.encryptionKeys.delete(docId);
    this.subscriptions.delete(docId);
  }

  async send(docId: string, message: RelayMessage): Promise<void> {
    const key = encryptionKeys.get(docId);
    if (!key) {
      throw new Error(`No encryption key for docId: ${docId}`);
    }
    const encoded = new TextEncoder().encode(JSON.stringify(message));
    const encrypted = await encrypt(encoded, key);
    const payload = arrayBufferToBase64(encrypted);
    this.outboundBatch.push({ version: 1, docId, payload });
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flushBatch(), BATCH_INTERVAL_MS);
    }
  }

  hasActiveSubscriptions(): boolean {
    return this.subscriptions.size > 0;
  }

  isSubscribed(docId: string): boolean {
    return this.subscriptions.has(docId);
  }

  close(): void {
    this.closedIntentionally = true;
    this.flushBatch();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    this.stopPingInterval();
    this.socket?.close();
    this.socket = null;
    this.encryptionKeys.clear();
    this.subscriptions.clear();
    setRelay(null);
  }
}

function connectRelay(
  onMessage: (docId: string, message: RelayMessage) => void,
  onStatusChange: (status: "connecting" | "connected" | "disconnected") => void,
): RelayConnection {
  const relay = new RelayConnectionImpl(onMessage, onStatusChange);
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

/** Check whether a specific docId has an active relay subscription. */
export function isDocSubscribed(docId: string): boolean {
  const relay = getRelay();
  if (!relay) {
    return false;
  }
  return relay.isSubscribed(docId);
}

// ── High-level orchestration (called by store actions) ───────────────

/** Start relay and subscribe a list of docIds. Filters expired shares. */
export function ensureRelaySubscriptions(
  shares: ReadonlyArray<{ docId: string; expiresAt: string }>,
): void {
  const now = new Date();
  const active = shares.filter((share) => new Date(share.expiresAt) > now);
  if (active.length === 0) {
    return;
  }
  startRelay();
  for (const share of active) {
    subscribeToDoc(share.docId);
  }
}

/** Start relay and subscribe a single docId (peer mode — no expiry check). */
export function startRelayForDoc(docId: string): void {
  startRelay();
  subscribeToDoc(docId);
}

/** Broadcast comment:resolved to peers via relay. Swallows errors. */
export function broadcastCommentResolved(
  docId: string,
  commentId: string,
): void {
  try {
    const relay = getRelay();
    if (relay) {
      relay
        .send(docId, { type: "comment:resolved", commentId })
        .catch((error) => {
          console.warn("[relay] resolve broadcast failed:", error);
        });
    }
  } catch (error) {
    console.warn("[relay] resolve broadcast setup failed:", error);
  }
}

/** Broadcast comment:added for each comment to peers. Swallows errors. */
export async function broadcastCommentsAdded(
  docId: string,
  comments: ReadonlyArray<PeerComment>,
): Promise<void> {
  try {
    const relay = getRelay();
    if (!relay) {
      return;
    }
    for (const comment of comments) {
      await relay.send(docId, { type: "comment:added", comment });
    }
  } catch (error) {
    console.warn("[relay] broadcast failed during syncPeerComments:", error);
  }
}
