# Todos — Real-Time Comment Sync

> Spec: [spec.md](./spec.md)

## Types & Data (spec §5.2)

- [ ] Add relay types to `src/types/relay.ts`

```typescript
import type { PeerComment } from "./share";

// --- Wire protocol (plaintext, seen by the DO) ---

export interface RelayFrame {
  version: 1;
  docId: string;
  payload: string; // base64-encoded encrypted RelayMessage
}

export interface SubscribeFrame {
  type: "subscribe";
  docId: string;
}

export interface UnsubscribeFrame {
  type: "unsubscribe";
  docId: string;
}

export interface ErrorFrame {
  type: "error";
  docId: string;
  message: string;
}

export interface SubscribeOkFrame {
  type: "subscribe:ok";
  docId: string;
}

export interface PingFrame {
  type: "ping";
}

export interface PongFrame {
  type: "pong";
}

export type ControlFrame =
  | SubscribeFrame
  | UnsubscribeFrame
  | PingFrame;

export type InboundFrame =
  | RelayFrame
  | ErrorFrame
  | SubscribeOkFrame
  | PongFrame;

// --- Relay messages (inside encrypted payload) ---

export type RelayMessage =
  | CommentAddedMessage
  | CommentResolvedMessage
  | DocumentUpdatedMessage;

export interface CommentAddedMessage {
  type: "comment:added";
  comment: PeerComment;
}

export interface CommentResolvedMessage {
  type: "comment:resolved";
  commentId: string;
}

export interface DocumentUpdatedMessage {
  type: "document:updated";
  updatedAt: string;
}
```

- [ ] Add `rtStatus`, `rtSocket`, `rtSubscriptions`, and `documentUpdateAvailable` fields to `AppState` in `src/store/index.ts`

```typescript
// Add to AppState interface, after peer mode fields:

// Real-time relay
rtStatus: "disconnected" | "connecting" | "connected";
rtSocket: RelayConnection | null;
rtSubscriptions: Set<string>;              // docIds currently subscribed to
documentUpdateAvailable: boolean;
remotePeerComments: PeerComment[];         // peer mode: comments from OTHER peers via relay
resolvedCommentIds: Set<string>;           // IDs of comments resolved via relay — prevents zombie comments on reorder
```

```typescript
// Add to initial state in create():

rtStatus: "disconnected",
rtSocket: null,
rtSubscriptions: new Set(),
documentUpdateAvailable: false,
remotePeerComments: [],
resolvedCommentIds: new Set(),
```

Note: `rtSocket`, `rtSubscriptions`, `documentUpdateAvailable`, `remotePeerComments`, and `resolvedCommentIds` must all be excluded from `persist` partialize — they are transient runtime state that is rebuilt on reconnect.

## Worker — Durable Object relay (spec §6.1, §6.2, §6.4)

- [ ] Create `worker/src/relay.ts` with `RelayHub` Durable Object class

The DO uses the Hibernation API so it shuts down when idle. Because we cannot dynamically add/remove tags after `acceptWebSocket`, we use `serializeAttachment` / `deserializeAttachment` to persist per-socket subscription state across hibernation wake-ups.

For routing, we iterate `this.state.getWebSockets()` and check each socket's attachment. This is O(connections) per message but perfectly fine for 2-5 concurrent peers.

```typescript
interface SocketAttachment {
  subscriptions: string[];
}

function getAttachment(ws: WebSocket): SocketAttachment {
  const raw = ws.deserializeAttachment();
  if (raw && typeof raw === "object" && Array.isArray(raw.subscriptions)) {
    return raw;
  }
  return { subscriptions: [] };
}

function setAttachment(ws: WebSocket, attachment: SocketAttachment): void {
  ws.serializeAttachment(attachment);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export class RelayHub implements DurableObject {
  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);
    setAttachment(server, { subscriptions: [] });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let data: unknown;
    try {
      const text = typeof message === "string" ? message : new TextDecoder().decode(message);
      data = JSON.parse(text);
    } catch (parseError) {
      console.error("[RelayHub] invalid JSON from client:", parseError);
      ws.send(JSON.stringify({ type: "error", docId: "", message: "Invalid JSON" }));
      return;
    }

    if (!isRecord(data)) {
      return;
    }

    const frame = data;

    if (frame.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
      return;
    }

    if (frame.type === "subscribe" && typeof frame.docId === "string") {
      // Verify doc exists in KV before accepting
      const meta = await this.env.LOLLIPOP_DRAGON.get(`share:${frame.docId}:meta`);
      if (!meta) {
        ws.send(JSON.stringify({ type: "error", docId: frame.docId, message: "Doc not found" }));
        return;
      }
      const attachment = getAttachment(ws);
      if (!attachment.subscriptions.includes(frame.docId)) {
        attachment.subscriptions.push(frame.docId);
        setAttachment(ws, attachment);
      }
      ws.send(JSON.stringify({ type: "subscribe:ok", docId: frame.docId }));
      return;
    }

    if (frame.type === "unsubscribe" && typeof frame.docId === "string") {
      const attachment = getAttachment(ws);
      attachment.subscriptions = attachment.subscriptions.filter(
        (docId: string) => docId !== frame.docId,
      );
      setAttachment(ws, attachment);
      return;
    }

    // Relay frame validation: must have version, docId, and payload
    if (frame.version !== 1 || typeof frame.docId !== "string" || typeof frame.payload !== "string") {
      return; // silently drop malformed frames
    }

    // Forward to all OTHER connections subscribed to frame.docId
    const allSockets = this.state.getWebSockets();
    const serialized = JSON.stringify(data);
    for (const peer of allSockets) {
      if (peer === ws) {
        continue;
      }
      const peerAttachment = getAttachment(peer);
      if (peerAttachment.subscriptions.includes(frame.docId)) {
        peer.send(serialized);
      }
    }
  }

  async webSocketClose(): Promise<void> {
    // Attachment is automatically discarded when the socket closes.
    // If no connections remain, the DO hibernates automatically.
    // No need to call ws.close() — the socket is already closed.
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    ws.close();
  }
}
```

- [ ] Add WebSocket upgrade route (`/relay`) to existing Worker fetch handler in `worker/src/index.ts`

```typescript
// Add before the existing `if (resource === "share")` block:

if (resource === "relay") {
  if (req.headers.get("Upgrade") !== "websocket") {
    return errRes(426, "WebSocket upgrade required", cors);
  }
  const hubId = env.RELAY_HUB.idFromName("hub");
  const hub = env.RELAY_HUB.get(hubId);
  return hub.fetch(req);
}
```

Also export `RelayHub` from the Worker entry point:

```typescript
export { RelayHub } from "./relay";
```

- [ ] Update `worker/wrangler.toml` with `RELAY_HUB` Durable Object binding and migration

```toml
[[durable_objects.bindings]]
name = "RELAY_HUB"
class_name = "RelayHub"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["RelayHub"]
```

Add `RELAY_HUB` to the `Env` interface in `worker/src/index.ts`:

```typescript
interface Env {
  LOLLIPOP_DRAGON: KVNamespace;
  ALLOWED_ORIGINS: string;
  RELAY_HUB: DurableObjectNamespace;  // new
}
```

- [ ] Deploy updated Worker and verify WebSocket upgrade works

## Client — Relay service (spec §6.3)

- [ ] Create `src/services/relay.ts` with `connectRelay()` returning `RelayConnection`

```typescript
import { encrypt, decrypt } from "./crypto";
import type { RelayMessage } from "../types/relay";
import { WORKER_URL } from "../config";

export interface RelayConnection {
  subscribe(docId: string, key: CryptoKey): void;
  unsubscribe(docId: string): void;
  send(docId: string, message: RelayMessage): Promise<void>;
  close(): void;
}

const VALID_RELAY_TYPES = new Set([
  "comment:added",
  "comment:resolved",
  "document:updated",
]);

function isValidRelayMessage(value: unknown): value is RelayMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return "type" in value && typeof value.type === "string" && VALID_RELAY_TYPES.has(value.type);
}

/** Convert an ArrayBuffer to a base64 string without hitting stack size limits. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
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
  const encryptionKeys = new Map<string, CryptoKey>();  // docId → encryption key
  const activeSubscriptions = new Set<string>();         // docIds to subscribe on (re)connect
  const confirmedSubscriptions = new Set<string>();  // docIds confirmed by DO
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
    if (outboundBatch.length === 0 || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    for (const frame of outboundBatch) {
      socket.send(JSON.stringify(frame));
    }
    outboundBatch = [];
    batchTimer = null;
  }

  function startPingInterval(): void {
    stopPingInterval();
    pingInterval = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
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
      backoff = 1000;
      onStatusChange("connected");
      startPingInterval();
      // Re-subscribe to all active docIds
      for (const docId of activeSubscriptions) {
        if (socket) {
          socket.send(JSON.stringify({ type: "subscribe", docId }));
        }
      }
    });

    socket.addEventListener("message", async (event) => {
      try {
        const frame = JSON.parse(typeof event.data === "string" ? event.data : "");

        // Handle pong (keep-alive response) — nothing to do
        if (frame.type === "pong") {
          return;
        }

        // Handle error frames from the DO (including subscribe rejection)
        if (frame.type === "error" && typeof frame.docId === "string") {
          console.warn("[relay] server error for docId", frame.docId, ":", frame.message);
          onSubscribeResult(frame.docId, false);
          // Schedule retry for failed subscribes (KV eventual consistency)
          if (activeSubscriptions.has(frame.docId)) {
            setTimeout(() => {
              if (socket && socket.readyState === WebSocket.OPEN && activeSubscriptions.has(frame.docId)) {
                socket.send(JSON.stringify({ type: "subscribe", docId: frame.docId }));
              }
            }, 5000);
          }
          return;
        }

        // Handle subscribe acknowledgment — notify the store
        if (frame.type === "subscribe:ok" && typeof frame.docId === "string") {
          confirmedSubscriptions.add(frame.docId);
          onSubscribeResult(frame.docId, true);
          return;
        }

        // Only decrypt frames that carry an encrypted payload
        if (!frame.payload || !frame.docId) {
          return;
        }

        const key = encryptionKeys.get(frame.docId);
        if (!key) {
          return; // No key for this docId — discard
        }
        const raw = Uint8Array.from(atob(frame.payload), (char) => char.charCodeAt(0));
        const decrypted = await decrypt(raw.buffer, key);
        const parsed: unknown = JSON.parse(new TextDecoder().decode(decrypted));
        if (!isValidRelayMessage(parsed)) {
          console.warn("[relay] invalid message shape, discarding");
          return;
        }
        onMessage(frame.docId, parsed);
      } catch (error) {
        console.warn("[relay] failed to decrypt/parse message:", error);
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

  return {
    subscribe(docId: string, key: CryptoKey) {
      // Always add to activeSubscriptions first — if the socket is closed,
      // the openConnection() handler will send all activeSubscriptions
      // on the next successful (re)connect.
      // The subscription is not considered confirmed until the DO sends
      // back a subscribe:ok frame, which adds it to confirmedSubscriptions.
      encryptionKeys.set(docId, key);
      activeSubscriptions.add(docId);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "subscribe", docId }));
      }
    },

    unsubscribe(docId: string) {
      // Send to DO first (if connected), then remove from local tracking.
      // This ordering matters: if the socket is closed, the unsubscribe
      // frame is lost — but removing from activeSubscriptions ensures
      // the reconnect loop won't re-subscribe to this docId.
      if (socket && socket.readyState === WebSocket.OPEN) {
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
    },
  };
}
```

Note: `close()` should be wired to the `beforeunload` event so the relay is cleaned up when the user navigates away or closes the tab:

```typescript
// In the component or service that calls openRelay():
window.addEventListener("beforeunload", () => {
  useAppStore.getState().closeRelay();
});
```

- [ ] Add `close()` cleanup and lazy connect/disconnect (5-min tab inactivity timeout)
  - Depends on: Types & Data

## Store / State (spec §5.3)

Single Zustand store — follows existing pattern. Relay state (`rtStatus`, `rtSocket`, `rtSubscriptions`, `documentUpdateAvailable`) goes on `AppState` root. Relay actions are thin wrappers that call `src/services/relay.ts` and update state via `set()`, same pattern as `shareSync.ts`.

- [ ] Add `setRtStatus` action to update `rtStatus`

```typescript
setRtStatus: (status) => set({ rtStatus: status }),
```

- [ ] Add `openRelay()` action that calls `connectRelay()` and wires incoming messages to store updates

```typescript
// --- Peer mode message handlers (if/else chain with discriminant narrowing) ---
// We use if/else instead of an object map here because discriminated unions
// require `as` casts in object maps, which is banned by project rules.

function handlePeerMessage(message: RelayMessage, state: AppState): Partial<AppState> {
  if (message.type === "comment:added") {
    // Comments from other peers go to remotePeerComments (NOT myPeerComments,
    // which is the current user's own comments — syncPeerComments would re-POST them)
    const isDuplicate = state.remotePeerComments.some(
      (comment) => comment.id === message.comment.id,
    );
    if (isDuplicate) {
      return {};
    }
    // Guard against relay/KV reordering: if this comment was already resolved
    // (resolve arrived before add), skip it to prevent zombie comments.
    if (state.resolvedCommentIds.has(message.comment.id)) {
      return {};
    }
    return {
      remotePeerComments: [...state.remotePeerComments, message.comment],
    };
  }

  if (message.type === "comment:resolved") {
    // comment:resolved can target own comments OR remote comments.
    // Track the resolved ID so a late-arriving comment:added for this ID
    // is skipped (prevents zombie comments from relay/KV reordering).
    const nextResolved = new Set(state.resolvedCommentIds);
    nextResolved.add(message.commentId);
    return {
      myPeerComments: state.myPeerComments.filter(
        (comment) => comment.id !== message.commentId,
      ),
      remotePeerComments: state.remotePeerComments.filter(
        (comment) => comment.id !== message.commentId,
      ),
      resolvedCommentIds: nextResolved,
    };
  }

  if (message.type === "document:updated") {
    return {
      documentUpdateAvailable: true,
    };
  }

  return {};
}

// --- Host mode message handler ---

function handleHostMessage(
  docId: string,
  message: RelayMessage,
  set: (fn: (state: AppState) => Partial<AppState>) => void,
): void {
  if (message.type === "comment:added") {
    set((state) => {
      const tabIndex = state.tabs.findIndex((tab) =>
        tab.shares.some((share) => share.docId === docId),
      );
      if (tabIndex === -1) {
        return {};
      }
      const targetTab = state.tabs[tabIndex];
      const existing = targetTab.pendingComments[docId] ?? [];
      if (existing.some((comment) => comment.id === message.comment.id)) {
        return {};
      }
      // Guard against relay/KV reordering: skip if already resolved
      if (state.resolvedCommentIds.has(message.comment.id)) {
        return {};
      }
      const updatedComments = [...existing, message.comment];
      // Update both pendingComments and the ShareRecord's pendingCommentCount
      // so the badge in SharedPanel reflects the new count without a manual fetch.
      const updatedShares = targetTab.shares.map((share) =>
        share.docId === docId
          ? { ...share, pendingCommentCount: updatedComments.length }
          : share,
      );
      return {
        tabs: state.tabs.map((tab, index) =>
          index === tabIndex
            ? {
                ...tab,
                pendingComments: { ...tab.pendingComments, [docId]: updatedComments },
                shares: updatedShares,
              }
            : tab,
        ),
      };
    });
    return;
  }

  // document:updated and comment:resolved are not applicable in host mode
}

// --- openRelay action ---

openRelay: () => {
  const currentState = get();
  if (currentState.rtSocket) {
    return; // Already connected
  }

  const relay = connectRelay(
    (docId, message) => {
      const state = get();
      if (state.isPeerMode) {
        const patch = handlePeerMessage(message, state);
        set(patch);
      } else {
        handleHostMessage(docId, message, set);
      }
    },
    (status) => {
      set({ rtStatus: status });
      if (status === "connected") {
        const reconnectedState = get();
        if (reconnectedState.isPeerMode) {
          // Peer mode catch-up: two steps.
          // 1. Re-fetch comments from KV to catch missed comment:added events.
          // 2. Re-fetch shared content to catch missed comment:resolved events
          //    (resolved comments are removed from the document by the host).
          const peerDocId = reconnectedState.peerActiveDocId;
          const peerKey = peerDocId ? reconnectedState.peerShareKeys[peerDocId] : null;
          if (peerDocId && peerKey) {
            const storage = getStorage();
            if (storage) {
              storage.fetchComments(peerDocId, peerKey).then((comments) => {
                const currentState = get();
                // Exclude comments already known: own comments, submitted comments, and existing remote
                const ownIds = new Set(currentState.myPeerComments.map((comment) => comment.id));
                const submittedIds = new Set(currentState.submittedPeerCommentIds);
                const remoteIds = new Set(currentState.remotePeerComments.map((comment) => comment.id));
                const newComments = comments.filter(
                  (comment) =>
                    !ownIds.has(comment.id) &&
                    !submittedIds.has(comment.id) &&
                    !remoteIds.has(comment.id) &&
                    !currentState.resolvedCommentIds.has(comment.id),
                );
                if (newComments.length > 0) {
                  set((state) => ({
                    remotePeerComments: [...state.remotePeerComments, ...newComments],
                  }));
                }
              }).catch((error) => {
                console.warn("[relay] peer comment catch-up failed:", error);
              });
            }
          }
          reconnectedState.loadSharedContent().catch((error) => {
            console.warn("[relay] peer content catch-up failed:", error);
          });
        } else {
          // Host mode: fetch pending comments for active tab.
          // LIMITATION: only covers the active tab. Background tabs
          // catch up when the user switches to them.
          reconnectedState.fetchAllPendingComments().catch((error) => {
            console.warn("[relay] host reconnect catch-up failed:", error);
          });
        }
      }
    },
    // onSubscribeResult — update rtSubscriptions only on confirmed success
    (docId, ok) => {
      if (ok) {
        const next = new Set(get().rtSubscriptions);
        next.add(docId);
        set({ rtSubscriptions: next });
      }
      // On failure, the relay service retries automatically (5s backoff).
      // rtSubscriptions is not updated until success, so the UI won't
      // falsely show a connected state for this docId.
    },
  );

  set({ rtSocket: relay });
},
```

- [ ] Add `subscribeDoc(docId)` and `unsubscribeDoc(docId)` actions

```typescript
subscribeDoc: (docId: string) => {
  const { rtSocket, rtSubscriptions } = get();
  if (!rtSocket) {
    return;
  }
  // Find the CryptoKey for this docId
  const state = get();
  let key: CryptoKey | undefined;
  if (state.isPeerMode) {
    key = state.peerShareKeys[docId];
  } else {
    for (const tab of state.tabs) {
      if (tab.shareKeys[docId]) {
        key = tab.shareKeys[docId];
        break;
      }
    }
  }
  if (!key) {
    console.warn("[relay] no key for docId:", docId);
    return;
  }
  // Send subscribe to the relay. Do NOT add to rtSubscriptions yet —
  // wait for subscribe:ok confirmation (handled in the onMessage callback).
  // The relay service tracks this docId in activeSubscriptions for reconnect
  // replay, and in confirmedSubscriptions after DO confirms.
  rtSocket.subscribe(docId, key);
},

unsubscribeDoc: (docId: string) => {
  const { rtSocket, rtSubscriptions } = get();
  if (!rtSocket) {
    return;
  }
  rtSocket.unsubscribe(docId);
  const next = new Set(rtSubscriptions);
  next.delete(docId);
  set({ rtSubscriptions: next });
},
```

- [ ] Add `closeRelay()` action

```typescript
closeRelay: () => {
  const { rtSocket } = get();
  if (rtSocket) {
    rtSocket.close();
  }
  set({ rtSocket: null, rtStatus: "disconnected", rtSubscriptions: new Set() });
},
```

- [ ] Add `dismissDocumentUpdate()` action

```typescript
dismissDocumentUpdate: () => {
  set({ documentUpdateAvailable: false });
},
```

- [ ] Integrate relay broadcast into existing comment actions
  - Depends on: Client — Relay service

The relay broadcast belongs in `syncPeerComments` (not `postPeerComment`), because `postPeerComment` is synchronous — it only adds to `myPeerComments` locally. The KV post happens in `syncPeerComments`. The relay broadcast should happen after the KV post succeeds so that peers receive the comment only once it is persisted.

All relay broadcasts are wrapped in try/catch so a relay bug cannot break the existing KV flow.

```typescript
// In syncPeerComments, after the KV post loop succeeds (after the for..of and set()):
try {
  const { rtSocket, peerActiveDocId } = get();
  if (rtSocket && peerActiveDocId) {
    for (const comment of unsubmitted) {
      await rtSocket.send(peerActiveDocId, {
        type: "comment:added",
        comment,
      });
    }
  }
} catch (relayError) {
  console.warn("[relay] broadcast failed during syncPeerComments:", relayError);
}

// In mergeComment (host resolves a peer comment):
// ORDERING: push content to KV FIRST, then broadcast.
// This ensures that if a peer reloads during the resolve window,
// the durable KV content already reflects the resolve.
try {
  await updateShare(docId);
} catch (pushError) {
  console.warn("[relay] auto-push after resolve failed:", pushError);
}

// Now broadcast — the relay notification comes after KV is durable.
try {
  const { rtSocket } = get();
  if (rtSocket) {
    rtSocket.send(docId, {
      type: "comment:resolved",
      commentId: comment.id,
    }).catch((relayError) => {
      console.warn("[relay] resolve broadcast failed:", relayError);
    });
  }
} catch (relayError) {
  console.warn("[relay] resolve broadcast setup failed:", relayError);
}
```

- [ ] Auto-push share content after host resolves a comment, BEFORE broadcasting `comment:resolved`
  - `mergeComment` should call `updateShare(docId)` after writing CriticMarkup to the local file
  - The push must complete before the relay broadcast — this ensures KV is durable before peers are notified
  - If a peer reloads during the resolve window, the KV content already reflects the resolve (transient `resolvedCommentIds` is not needed)
  - Without this ordering, `loadSharedContent()` on peer reconnect may return stale content
  - Depends on: `updateShare` from `src/services/shareSync.ts`

- [ ] Integrate relay broadcast into `updateShare` flow: after KV write, broadcast `document:updated`
  - Depends on: Client — Relay service

```typescript
// In shareSync.ts updateShare(), after storage.updateContent() succeeds:
try {
  const { rtSocket } = useAppStore.getState();
  if (rtSocket) {
    rtSocket.send(docId, {
      type: "document:updated",
      updatedAt: new Date().toISOString(),
    }).catch((relayError) => {
      console.warn("[relay] document:updated broadcast failed:", relayError);
    });
  }
} catch (relayError) {
  console.warn("[relay] document:updated broadcast setup failed:", relayError);
}
```

- [ ] Auto-open relay and subscribe on share creation and page load
  - Depends on: `openRelay`, `subscribeDoc`

```typescript
// In shareContent(), after the share is created:
get().openRelay();
get().subscribeDoc(docId);

// At the end of restoreTabs(), after all tabs and share keys are restored:
get().openRelay();
for (const share of activeShares) {
  get().subscribeDoc(share.docId);
}
```

- [ ] Auto-open relay in peer mode after `loadSharedContent` succeeds
  - Depends on: `openRelay`, `subscribeDoc`

```typescript
// In loadSharedContent(), after content is decrypted and stored:
get().openRelay();
get().subscribeDoc(docId);
```

- [ ] On reconnect, catch up from KV (mode-aware)
  - Handled in the `onStatusChange("connected")` callback inside `openRelay()`.
  - **Peer mode**: fetches comments from KV via `fetchComments(docId, key)`, excludes own comments (`myPeerComments`, `submittedPeerCommentIds`), merges remainder into `remotePeerComments`. Then calls `loadSharedContent()` to catch resolved comments (requires host to have auto-pushed after resolve).
  - **Host mode**: calls `fetchAllPendingComments()` (active tab only — background tabs catch up on switch).
- [ ] Hide "Check comments" button when `rtStatus === "connected"` and the share's docId is subscribed
  - Depends on: `openRelay`
- [ ] Replace bulk `clearPendingComments` KV deletion with per-comment deletion
  - Current behavior: when host dismisses last pending comment, ALL KV comments for the share are deleted
  - With real-time delivery, comments may arrive between the last fetch and the delete call, causing data loss
  - Add `DELETE /comments/:docId/:cmtId` endpoint to the Worker for single-comment deletion
  - Update `mergeComment` and `dismissComment` to delete only the specific comment from KV
  - Depends on: Worker changes

## Components / UI (spec §5.4)

- [ ] Create `src/components/ConnectionStatus/ConnectionStatus.tsx`

```tsx
import { useAppStore } from "../../store";
import "./ConnectionStatus.css";

export function ConnectionStatus() {
  const rtStatus = useAppStore((state) => state.rtStatus);
  const isPeerMode = useAppStore((state) => state.isPeerMode);
  const activeTabHasShares = useAppStore((state) => {
    if (state.isPeerMode) {
      return false;
    }
    const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
    if (!activeTab) {
      return false;
    }
    const now = new Date();
    return activeTab.shares.some((share) => new Date(share.expiresAt) > now);
  });

  if (!isPeerMode && !activeTabHasShares) {
    return null;
  }

  return (
    <span className="connection-status" data-status={rtStatus}>
      <span className="connection-status__dot" />
      <span className="connection-status__label">
        {rtStatus === "connected" && "Connected"}
        {rtStatus === "connecting" && "Connecting..."}
        {rtStatus === "disconnected" && "Offline"}
      </span>
    </span>
  );
}
```

- [ ] Create `src/components/ConnectionStatus/ConnectionStatus.css`

```css
.connection-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.connection-status__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-text-muted);
}

.connection-status[data-status="connected"] .connection-status__dot {
  background: var(--color-success, #22c55e);
}

.connection-status[data-status="connecting"] .connection-status__dot {
  background: var(--color-warning, #f59e0b);
}

.connection-status[data-status="disconnected"] .connection-status__dot {
  background: var(--color-text-muted);
}
```

- [ ] Create `src/components/ConnectionStatus/index.ts` — barrel export

```typescript
export { ConnectionStatus } from "./ConnectionStatus";
```

- [ ] Create `src/components/ContentUpdateBanner/ContentUpdateBanner.tsx`

Reads `documentUpdateAvailable` from the store. When visible, clicking the banner calls `loadSharedContent()` and then resets the flag. This replaces the plain toast string approach.

```tsx
import { useAppStore } from "../../store";
import "./ContentUpdateBanner.css";

export function ContentUpdateBanner() {
  const documentUpdateAvailable = useAppStore((state) => state.documentUpdateAvailable);
  const loadSharedContent = useAppStore((state) => state.loadSharedContent);
  const dismissDocumentUpdate = useAppStore((state) => state.dismissDocumentUpdate);

  if (!documentUpdateAvailable) {
    return null;
  }

  async function handleRefresh(): Promise<void> {
    dismissDocumentUpdate();
    await loadSharedContent();
  }

  return (
    <div className="content-update-banner">
      <span>The shared document has been updated.</span>
      <button
        className="content-update-banner__refresh"
        type="button"
        onClick={() => {
          handleRefresh().catch((error) => {
            console.warn("[ContentUpdateBanner] refresh failed:", error);
          });
        }}
      >
        Refresh
      </button>
      <button
        className="content-update-banner__dismiss"
        type="button"
        onClick={dismissDocumentUpdate}
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  );
}
```

- [ ] Create `src/components/ContentUpdateBanner/ContentUpdateBanner.css`

```css
.content-update-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: var(--color-info-bg, #dbeafe);
  color: var(--color-info-text, #1e40af);
  font-size: 0.875rem;
  border-bottom: 1px solid var(--color-info-border, #93c5fd);
}

.content-update-banner__refresh {
  padding: 4px 12px;
  border: 1px solid currentColor;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.8125rem;
}

.content-update-banner__refresh:hover {
  background: var(--color-info-hover, #bfdbfe);
}

.content-update-banner__dismiss {
  margin-left: auto;
  padding: 2px 6px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
}
```

- [ ] Create `src/components/ContentUpdateBanner/index.ts` — barrel export

```typescript
export { ContentUpdateBanner } from "./ContentUpdateBanner";
```

- [ ] Update peer-mode UI to render `remotePeerComments` alongside `myPeerComments`
  - Add a selector that combines both lists for display: `allVisiblePeerComments`
  - Update `CommentPanel` to read from the combined selector in peer mode
  - Update `CommentMargin` to show margin dots for remote peer comments
  - Update `Header` comment count to include remote peer comments
  - Remote peer comments should be read-only (no edit/delete buttons)
  - Depends on: Store / State

## Integration

- [ ] Wire `<ConnectionStatus />` into `Header` component (near share controls)
  - Depends on: Components / UI
- [ ] Wire `<ContentUpdateBanner />` into peer mode layout (above content area)
  - Depends on: Components / UI
- [ ] Unsubscribe from docId on share revoke; close relay when no subscriptions remain
  - Depends on: Store / State
- [ ] Clean up relay connection on app unmount and `beforeunload`
  - Wire `closeRelay()` to `window.addEventListener("beforeunload", ...)` so the WebSocket is closed cleanly when the user navigates away
  - Depends on: Store / State
- [ ] Update `docs/features/realtime-collaboration.md` to mark it as superseded by this approach

## Testing (spec §7)

- [ ] Test: RelayHub DO — relays message to other connections subscribed to same docId, does not echo to sender
  - Depends on: Worker — Durable Object relay
- [ ] Test: RelayHub DO — rejects subscribe when doc does not exist in KV, sends ErrorFrame
  - Depends on: Worker — Durable Object relay
- [ ] Test: RelayHub DO — does not forward messages to connections subscribed to a different docId
  - Depends on: Worker — Durable Object relay
- [ ] Test: RelayHub DO — responds to PingFrame with PongFrame
  - Depends on: Worker — Durable Object relay
- [ ] Test: RelayHub DO — survives hibernation by recovering subscriptions from attachments
  - Depends on: Worker — Durable Object relay
- [ ] Test: `connectRelay` encrypts outbound and decrypts inbound messages per docId key
  - Depends on: Client — Relay service
- [ ] Test: `connectRelay` debounces outbound messages with a 500ms window (events are still sent as individual frames)
  - Depends on: Client — Relay service
- [ ] Test: `connectRelay` reconnects with exponential backoff and re-subscribes on reconnect
  - Depends on: Client — Relay service
- [ ] Test: `connectRelay` handles ErrorFrame and PongFrame without attempting decryption
  - Depends on: Client — Relay service
- [ ] Test: `connectRelay` sends ping every 30s to keep VPN connections alive
  - Depends on: Client — Relay service
- [ ] Test: `connectRelay` flushes outbound batch synchronously on close
  - Depends on: Client — Relay service
- [ ] Test: `arrayBufferToBase64` handles large payloads without stack overflow
  - Depends on: Client — Relay service
- [ ] Test: client only adds docId to confirmed subscriptions after receiving `subscribe:ok`
  - Depends on: Client — Relay service
- [ ] Test: client retries subscribe with backoff when DO responds with error
  - Depends on: Client — Relay service
- [ ] Test: incoming `comment:added` adds to host's `pendingComments` for the correct tab
  - Depends on: Store / State
- [ ] Test: incoming `comment:added` deduplicates by comment ID in host mode
  - Depends on: Store / State
- [ ] Test: `syncPeerComments` broadcasts `comment:added` via relay after KV post (not in `postPeerComment`)
  - Depends on: Store / State
- [ ] Test: `mergeComment` broadcasts `comment:resolved` to peers
  - Depends on: Store / State
- [ ] Test: relay broadcast failure does not break KV flow
  - Depends on: Store / State
- [ ] Test: KV catch-up fires on reconnect for all subscribed docIds
  - Depends on: Store / State
- [ ] Test: peer reconnect calls `loadSharedContent()` to catch up (not `fetchAllPendingComments`)
  - Depends on: Store / State
- [ ] Test: `ConnectionStatus` renders correct dot color for each `rtStatus` value
  - Depends on: Components / UI
- [ ] Test: `ContentUpdateBanner` appears when `documentUpdateAvailable` is true
  - Depends on: Components / UI
- [ ] Test: `ContentUpdateBanner` calls `loadSharedContent` and resets flag on click
  - Depends on: Components / UI
- [ ] Test: "Check comments" button hidden when connected and subscribed
  - Depends on: Components / UI
- [ ] Test: fallback — when WebSocket is disconnected, async KV flow still works
  - Depends on: Store / State
