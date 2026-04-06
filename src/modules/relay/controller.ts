import { encrypt, decrypt } from "../../services/crypto";
import type {
  CommentsSnapshotEntry,
  RelayEvent,
  RelayMessage,
} from "../../types/relay";
import type { PeerComment } from "../../types/share";
import { useAppStore } from "../../store";
import { WORKER_URL } from "../../config";

export interface RelayConnection {
  subscribe(
    docId: string,
    key: CryptoKey,
    role: "host" | "peer",
    hostSecret?: string,
  ): void;
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

type ParsedFrame =
  | { kind: "pong" }
  | { kind: "error"; docId: string; message: string }
  | { kind: "subscribeOk"; docId: string }
  | { kind: "commentAddAck"; docId: string; cmtId: string }
  | { kind: "commentResolveAck"; docId: string; cmtId: string }
  | {
      kind: "commentsSnapshot";
      docId: string;
      comments: CommentsSnapshotEntry[];
    }
  | { kind: "commentAdded"; docId: string; cmtId: string; payload: string }
  | { kind: "commentResolved"; docId: string; cmtId: string }
  | { kind: "relay"; docId: string; payload: string }
  | { kind: "unknown" };

interface RelayContext {
  subscriptions: Set<string>;
  confirmed: Set<string>;
  socket: WebSocket | null;
  retrySubscribe: (docId: string) => void;
  onSubscribeOk: (docId: string) => void;
  onCommentAddAck: (docId: string, cmtId: string) => void;
  onCommentResolveAck: (docId: string, cmtId: string) => void;
  onSnapshot: (docId: string, comments: CommentsSnapshotEntry[]) => void;
  onCommentAdded: (docId: string, cmtId: string, payload: string) => void;
  onCommentResolved: (docId: string, cmtId: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCommentsSnapshotEntries(
  value: unknown,
): value is CommentsSnapshotEntry[] {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every((entry) => {
    if (!isRecord(entry)) {
      return false;
    }
    return (
      typeof entry["cmtId"] === "string" && typeof entry["payload"] === "string"
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
    raw.type === "comment:add:ack" &&
    typeof raw.docId === "string" &&
    typeof raw.cmtId === "string"
  ) {
    return { kind: "commentAddAck", docId: raw.docId, cmtId: raw.cmtId };
  }
  if (
    raw.type === "comment:resolve:ack" &&
    typeof raw.docId === "string" &&
    typeof raw.cmtId === "string"
  ) {
    return {
      kind: "commentResolveAck",
      docId: raw.docId,
      cmtId: raw.cmtId,
    };
  }
  if (
    raw.type === "comments:snapshot" &&
    typeof raw.docId === "string" &&
    isCommentsSnapshotEntries(raw.comments)
  ) {
    return {
      kind: "commentsSnapshot",
      docId: raw.docId,
      comments: raw.comments,
    };
  }
  if (
    raw.type === "comment:added" &&
    typeof raw.docId === "string" &&
    typeof raw.cmtId === "string" &&
    typeof raw.payload === "string"
  ) {
    return {
      kind: "commentAdded",
      docId: raw.docId,
      cmtId: raw.cmtId,
      payload: raw.payload,
    };
  }
  if (
    raw.type === "comment:resolved" &&
    typeof raw.docId === "string" &&
    typeof raw.cmtId === "string"
  ) {
    return {
      kind: "commentResolved",
      docId: raw.docId,
      cmtId: raw.cmtId,
    };
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
      context.retrySubscribe(retryDocId);
    }
  }, SUBSCRIPTION_RETRY_DELAY_MS);
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
    context.confirmed.add(frame.docId);
    context.onSubscribeOk(frame.docId);
    return true;
  }
  if (frame.kind === "commentAddAck") {
    context.onCommentAddAck(frame.docId, frame.cmtId);
    return true;
  }
  if (frame.kind === "commentResolveAck") {
    context.onCommentResolveAck(frame.docId, frame.cmtId);
    return true;
  }
  if (frame.kind === "commentsSnapshot") {
    context.onSnapshot(frame.docId, frame.comments);
    return true;
  }
  if (frame.kind === "commentAdded") {
    context.onCommentAdded(frame.docId, frame.cmtId, frame.payload);
    return true;
  }
  if (frame.kind === "commentResolved") {
    context.onCommentResolved(frame.docId, frame.cmtId);
    return true;
  }
  return false;
}

async function decryptAndDispatch(
  frame: ParsedFrame,
  encryptionKeys: Map<string, CryptoKey>,
  onMessage: (docId: string, event: RelayEvent) => void,
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    const slice = bytes.subarray(offset, offset + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function isPeerComment(value: unknown): value is PeerComment {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value["id"] !== "string") {
    return false;
  }
  if (typeof value["peerName"] !== "string") {
    return false;
  }
  if (typeof value["path"] !== "string") {
    return false;
  }
  if (typeof value["commentType"] !== "string") {
    return false;
  }
  if (typeof value["text"] !== "string") {
    return false;
  }
  if (typeof value["createdAt"] !== "string") {
    return false;
  }
  if (!isRecord(value["blockRef"])) {
    return false;
  }
  return (
    typeof value["blockRef"]["blockIndex"] === "number" &&
    typeof value["blockRef"]["contentPreview"] === "string"
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
  private subscriptions = new Set<string>();
  private confirmedSubscriptions = new Set<string>();
  private subscriptionMeta = new Map<
    string,
    { role: "host" | "peer"; hostSecret?: string }
  >();
  private encryptionKeys = new Map<string, CryptoKey>();
  private wsUrl: string;

  constructor(
    private onMessage: (docId: string, event: RelayEvent) => void,
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

  private sendSubscribeFrame(
    docId: string,
    role: "host" | "peer",
    hostSecret?: string,
  ): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    const frame: Record<string, string> = { type: "subscribe", docId, role };
    if (hostSecret) {
      frame.hostSecret = hostSecret;
    }
    this.socket.send(JSON.stringify(frame));
  }

  private retrySubscribe = (docId: string): void => {
    const meta = this.subscriptionMeta.get(docId);
    if (!meta) {
      return;
    }
    this.sendSubscribeFrame(docId, meta.role, meta.hostSecret);
  };

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
    this.onStatusChange("connected");
    this.startPingInterval();
    this.resubscribeAll();
  };

  private resubscribeAll(): void {
    for (const docId of this.subscriptions) {
      const meta = this.subscriptionMeta.get(docId);
      if (meta) {
        this.sendSubscribeFrame(docId, meta.role, meta.hostSecret);
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
        confirmed: this.confirmedSubscriptions,
        socket: this.socket,
        retrySubscribe: this.retrySubscribe,
        onSubscribeOk: (docId) => handleSubscribeConfirmed(docId),
        onCommentAddAck: (docId, cmtId) =>
          this.onMessage(docId, { type: "comment:add:ack", cmtId }),
        onCommentResolveAck: (docId, cmtId) =>
          this.onMessage(docId, { type: "comment:resolve:ack", cmtId }),
        onSnapshot: (docId, comments) =>
          this.onMessage(docId, { type: "comments:snapshot", comments }),
        onCommentAdded: (docId, cmtId, payload) =>
          this.onMessage(docId, { type: "comment:added", cmtId, payload }),
        onCommentResolved: (docId, cmtId) =>
          this.onMessage(docId, { type: "comment:resolved", cmtId }),
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

  subscribe(
    docId: string,
    key: CryptoKey,
    role: "host" | "peer",
    hostSecret?: string,
  ): void {
    this.encryptionKeys.set(docId, key);
    this.subscriptions.add(docId);
    this.subscriptionMeta.set(docId, { role, hostSecret });
    this.sendSubscribeFrame(docId, role, hostSecret);
  }

  unsubscribe(docId: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "unsubscribe", docId }));
    }
    this.encryptionKeys.delete(docId);
    this.subscriptions.delete(docId);
    this.confirmedSubscriptions.delete(docId);
    this.subscriptionMeta.delete(docId);
  }

  sendCommentAdd(docId: string, cmtId: string, payload: string): void {
    if (
      this.socket?.readyState !== WebSocket.OPEN ||
      !this.confirmedSubscriptions.has(docId)
    ) {
      return;
    }
    this.socket.send(
      JSON.stringify({ type: "comment:add", docId, cmtId, payload }),
    );
  }

  sendCommentResolve(docId: string, cmtId: string): void {
    if (
      this.socket?.readyState !== WebSocket.OPEN ||
      !this.confirmedSubscriptions.has(docId)
    ) {
      return;
    }
    this.socket.send(JSON.stringify({ type: "comment:resolve", docId, cmtId }));
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
    this.socket.send(JSON.stringify({ version: 1, docId, payload }));
  }

  hasActiveSubscriptions(): boolean {
    return this.subscriptions.size > 0;
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
    this.subscriptions.clear();
    this.confirmedSubscriptions.clear();
    this.subscriptionMeta.clear();
    setRelay(null);
  }
}

function connectRelay(
  onMessage: (docId: string, event: RelayEvent) => void,
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

function findHostSecret(docId: string): string | undefined {
  const state = useAppStore.getState();
  for (const tab of state.tabs) {
    const record = tab.shares.find((share) => share.docId === docId);
    if (record) {
      return record.hostSecret;
    }
  }
  return undefined;
}

async function decryptAndAddPendingComment(
  docId: string,
  cmtId: string,
  encryptedPayload: string,
): Promise<void> {
  const key = findEncryptionKey(docId);
  if (!key) {
    return;
  }
  try {
    const comment = await decryptPeerComment(encryptedPayload, key, cmtId);
    useAppStore.getState().addPendingComment(docId, comment);
  } catch (error) {
    console.warn("[relay] failed to decrypt comment:", error);
  }
}

async function decryptAndReplaceSnapshot(
  docId: string,
  entries: CommentsSnapshotEntry[],
): Promise<void> {
  const key = findEncryptionKey(docId);
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
    }
  }
  useAppStore.getState().replaceCommentsSnapshot(docId, comments);
}

function handleIncomingMessage(docId: string, event: RelayEvent): void {
  const state = useAppStore.getState();

  if (event.type === "comment:added") {
    if (!state.isPeerMode) {
      void decryptAndAddPendingComment(docId, event.cmtId, event.payload);
    }
    return;
  }

  if (event.type === "comments:snapshot") {
    if (!state.isPeerMode) {
      void decryptAndReplaceSnapshot(docId, event.comments);
    }
    return;
  }

  if (event.type === "comment:add:ack") {
    state.confirmPeerCommentSubmitted(event.cmtId);
    return;
  }

  if (event.type === "comment:resolve:ack") {
    state.confirmPendingResolve(docId, event.cmtId);
    return;
  }

  if (event.type === "comment:resolved") {
    if (state.isPeerMode) {
      state.deletePeerComment(event.cmtId);
    }
    return;
  }

  if (event.type === "document:updated") {
    if (state.isPeerMode) {
      state.setDocumentUpdateAvailable(true);
    }
  }
}

function performReconnectCatchUp(): void {
  const state = useAppStore.getState();
  if (state.isPeerMode) {
    state.loadSharedContent().catch((error: unknown) => {
      console.warn("[relay] peer content catch-up failed:", error);
    });
  }
}

function handleStatusChange(
  status: "connecting" | "connected" | "disconnected",
): void {
  useAppStore.getState().setRelayStatus(status);
  if (status === "connected") {
    performReconnectCatchUp();
  }
}

function handleSubscribeConfirmed(docId: string): void {
  const state = useAppStore.getState();
  if (state.isPeerMode) {
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
  const state = useAppStore.getState();
  if (state.isPeerMode) {
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
  useAppStore.getState().setRelayStatus("disconnected");
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
    subscribeToDoc(share.docId);
  }
}

export function startRelayForDoc(docId: string): void {
  startRelay();
  subscribeToDoc(docId);
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
