# MarkReview — Real-Time Comment Sync

## 1. Overview

Real-time comment sync adds a WebSocket relay via Cloudflare Durable Objects so that peer comments reach the host instantly and vice versa. When a peer adds a comment, the host sees it within seconds — no manual "Check comments" step. When the host resolves a comment, peers see it removed. The existing async KV layer remains as the persistence backend and offline fallback.

## 2. Context

MarkReview v2 provides async peer sharing via a Cloudflare Worker + KV. Peers post encrypted comments to the Worker; the host fetches them manually. This works for async review cycles but is cumbersome during live sessions where host and peer are on a call.

A previous attempt (v3) used browser-to-browser WebRTC via Trystero + Yjs. It failed because the product is used inside a corporate VPN that blocks WebRTC connections (both signaling relays and direct peer connections). Four signaling backends were tried over three days — Nostr, BitTorrent, MQTT, back to Nostr — none were reliable on VPN.

The new approach uses a Cloudflare Durable Object as a WebSocket relay. WebSocket runs over standard HTTPS (port 443), which is much more likely to pass through corporate VPNs than WebRTC, since blocking WSS on port 443 would break most web applications. Both host and peer connect to the DO room via WSS; the DO relays encrypted messages between them. No peer-to-peer connection needed.

## 3. Scope

### Included

- Durable Object WebSocket relay (single hub DO, multiplexed by docId)
- Host connects to DO room when sharing a document or on page load for active shares
- Peer connects to DO room when opening a shared link
- Real-time comment events: add, resolve (edit and delete deferred to v2 — see §9 Limitations)
- Content-update notification: when host pushes updated content, connected peers get an instant notification instead of polling
- Connection status indicator (connected / connecting / offline)
- Encryption: all messages encrypted with the existing AES-256-GCM share key before sending
- WebSocket Hibernation API for cost optimization
- Graceful fallback: if WebSocket fails, existing KV async flow continues to work
- Request optimization: debounced sending, echo suppression, minimal keep-alive ping for VPN proxy compatibility

### Excluded

- Presence indicators (who's online, which file they're viewing)
- Cursor tracking / focused block indicators
- Typing indicators
- Yjs / CRDT — plain JSON events are sufficient (no concurrent editing conflicts)
- Multi-reviewer merge UI changes
- Changes to the async KV fallback model (peer POST / host GET semantics remain). Note: the KV comment endpoints themselves DO change — per-comment deletion is added and resolve triggers auto-push. See §5.3 host flow.
- Real-time edit/delete — KV persistence is append-only; supporting relay-only edits/deletes creates an inconsistency with KV as reconnect source of truth. Deferred until KV supports per-comment mutation.

## 4. User Decisions

| Decision | Choice |
|----------|--------|
| Transport | Cloudflare Durable Object WebSocket relay (not WebRTC) |
| Why not WebRTC | VPN blocks both signaling relays and peer connections |
| Sync protocol | Plain JSON events (add/resolve in v1), no Yjs CRDT |
| Why no Yjs | No concurrent editing of same data — each author owns their comments, host resolves |
| DO placement | Same Worker as existing REST API (single deployment, shared KV access) |
| Presence | Not in this iteration — comments only |
| Live content updates | Yes — 1 message per update, negligible cost |
| Async KV layer | Remains the persistence backend and offline fallback. KV endpoints extended for per-comment resolve handling. |

## 5. Architecture

### 5.1 High-Level Design

```
┌─────────────────────┐                      ┌──────────────────────────────┐
│    Host Browser      │         WSS          │  Cloudflare Durable Object   │
│                      │◄───────────────────►│  (single relay hub)          │
│  - Opens local files │                      │                              │
│  - Shares content    │                      │  - Single WSS per client     │
│  - Receives comments │                      │  - Multiplexed by docId      │
│    in real time      │                      │  - Echo suppression          │
└─────────────────────┘                      │  - Hibernates when idle      │
                                              │                              │
┌─────────────────────┐         WSS          │                              │
│    Peer Browser      │◄───────────────────►│                              │
│                      │                      └──────────────────────────────┘
│  - Opens shared link │
│  - Posts comments    │         HTTPS/REST
│  - Gets live updates │◄──────────────────►┌──────────────────────────────┐
└─────────────────────┘                      │  Cloudflare Worker + KV      │
                                              │  (async blob store)          │
                                              │  - Content upload/fetch      │
                                              │  - Comment persistence       │
                                              │  - TTL auto-purge            │
                                              └──────────────────────────────┘
```

**The WebSocket relay replaces the manual KV comment-fetching flow.** When connected, comments are delivered to the host in real time — no "Check comments" button, no polling, no manual fetch. KV is demoted from the primary delivery mechanism to a persistence and offline fallback layer.

Each client opens **one WebSocket** to a single relay hub DO. Messages include a `docId` field for routing — the DO forwards each message to all other clients subscribed to the same `docId`. Clients subscribe/unsubscribe to specific docIds as needed.

#### KV flow deprecation plan

The v2 async comment flow (peer POSTs to KV → host clicks "Check comments" → host reviews and merges) is replaced by the WebSocket relay as the primary path. What changes:

| Aspect | v2 (current) | With WebSocket relay |
|--------|-------------|---------------------|
| Comment delivery to host | Manual: host clicks "Check comments", fetches from KV | Automatic: arrives via WebSocket in real time |
| "Check comments" button | Primary action for receiving feedback | **Removed** when connected. Falls back to v2 behavior only when disconnected |
| Comment persistence | Peer POSTs to KV | Peer POSTs to KV **and** broadcasts via WebSocket. KV write is for durability, not delivery |
| Host notification | Badge count on Shared panel after manual fetch | Comments appear in `pendingComments` automatically as they arrive |
| Merge flow | Host reviews pending comments, clicks "Merge" | **Unchanged** — host still reviews and merges into CriticMarkup |
| Offline/disconnected | Only option — manual KV fetch | Fallback — same as v2 when WebSocket is unavailable |

The KV comment endpoints (`POST /comments/:docId`, `GET /comments/:docId`) remain operational. They serve two purposes:
1. **Persistence**: every comment is written to KV regardless of WebSocket status, so nothing is lost if the relay is down.
2. **Catch-up on reconnect**: when a client reconnects after a disconnection, it fetches the latest comments from KV to sync any messages missed while offline.

#### File vs folder shares

The relay does not distinguish between file and folder shares. A share is identified by its `docId` regardless of whether it covers one file or many. Comment messages include a `path` field (from the existing `PeerComment` type) that identifies which file within a share the comment belongs to. No dedicated folder flow is needed.

### 5.2 Data Model

#### Wire protocol

Each WebSocket frame is a JSON object with a plaintext `docId` (for DO routing) and an encrypted `payload` (opaque to the DO):

```typescript
// Wire format — what goes over the WebSocket
interface RelayFrame {
  version: 1;
  docId: string;              // plaintext — the DO reads this for routing
  payload: string;            // base64-encoded encrypted RelayMessage
}
```

The DO reads `docId` to know which subscribers to forward to. It never decrypts `payload`.

Control messages (subscribe/unsubscribe) are also plaintext JSON — no encryption needed since they contain only the docId:

```typescript
interface SubscribeFrame {
  type: "subscribe";
  docId: string;
}

interface UnsubscribeFrame {
  type: "unsubscribe";
  docId: string;
}

/** Sent by the DO back to the client on successful subscribe */
interface SubscribeOkFrame {
  type: "subscribe:ok";
  docId: string;
}

/** Sent by the DO back to the client when a subscribe fails (or for other errors) */
interface ErrorFrame {
  type: "error";
  docId: string;
  message: string;
}
```

#### Relay message types (inside encrypted payload)

```typescript
// src/types/relay.ts

/** Discriminated union of all relay message types */
type RelayMessage =
  | CommentAddedMessage
  | CommentResolvedMessage
  | DocumentUpdatedMessage;

interface CommentAddedMessage {
  type: "comment:added";
  comment: PeerComment;       // existing PeerComment type from types/share.ts
}

/** Host resolved/merged a comment — peers should remove it from their view */
interface CommentResolvedMessage {
  type: "comment:resolved";
  commentId: string;
}

/** Host pushed updated document to KV. Peers show a "Document updated" notification. */
interface DocumentUpdatedMessage {
  type: "document:updated";
  updatedAt: string;           // ISO 8601
}
```

#### Connection parameters

The WebSocket URL is a single endpoint — no docId in the URL:

```
wss://<worker-host>/relay
```

Clients subscribe to specific docIds after connecting. The DO verifies each subscribed docId exists in KV before accepting the subscription. **Note**: KV is eventually consistent — a document just created may not be visible for up to 60 seconds. If subscribe fails due to this, the client retries with backoff while the socket remains open (see §5.3 step 3). The encryption key (in the URL fragment) never reaches the server.

#### State additions

```typescript
// On AppState root (global)
rtStatus: "disconnected" | "connecting" | "connected";
rtSocket: RelayConnection | null;          // not persisted
rtSubscriptions: Set<string>;              // docIds currently subscribed to
documentUpdateAvailable: boolean;          // peer mode: host pushed new content
remotePeerComments: PeerComment[];         // peer mode: comments received from OTHER peers via relay
resolvedCommentIds: Set<string>;           // IDs of resolved comments — prevents zombie comments on relay/KV reorder

// On TabState (host mode, per-tab)
// No new fields — existing shares[] and pendingComments are reused.
// Real-time comments arrive as pendingComments entries via the relay.
```

### 5.3 Lifecycle

#### WebSocket connection

Both host and peer share a single WebSocket connection to the relay hub. The connection is opened lazily — only when the client has at least one docId to subscribe to — and stays open as long as any subscriptions are active.

1. Client opens a WebSocket to `wss://<worker>/relay`.
2. Client sends `{ type: "subscribe", docId: "..." }` for each docId it cares about.
3. The DO verifies the doc exists in KV. On success, it adds the connection to that docId's subscriber list and responds with `{ type: "subscribe:ok", docId }`. On failure, it responds with `{ type: "error", docId, message: "Doc not found" }`. The client only adds the docId to its local subscription state after receiving `subscribe:ok`. If subscribe fails, the client retries with backoff while the socket remains open.
4. When the client no longer needs a docId (e.g., tab closed, share revoked), it sends `{ type: "unsubscribe", docId: "..." }`.
5. When no subscriptions remain, the client closes the WebSocket (intentional close — no reconnect).
6. The client sends a lightweight ping frame every 30 seconds to prevent corporate proxies from killing the idle connection. This is separate from WebSocket protocol-level pings — it's an application-level `{ type: "ping" }` message. The DO responds with `{ type: "pong" }`. This ensures the connection survives VPN/proxy idle timeouts (commonly 30–120 seconds).

**v1 lifecycle model:** The socket stays open for as long as the client has active subscriptions. There is no inactivity-based disconnect in v1 — the 5-minute lazy disconnect is deferred to a future optimization. Reopening after an intentional close (e.g., all shares revoked, then a new share created) triggers a fresh `openRelay()` → subscribe flow.

#### Host flow

1. Host opens the app with active shares (or creates a new share).
2. The app opens the WebSocket (if not already open) and subscribes to each active share's `docId`.
3. Incoming messages are routed by `docId` to the correct tab's `pendingComments`.

**Receiving comments from peers:**

| Message | Host action |
|---------|-------------|
| `comment:added` | Add to `pendingComments` for the matching share — appears in the pending review UI automatically |

**Broadcasting to peers:**

| Host action | Message sent |
|-------------|-------------|
| Merges/resolves a comment | `comment:resolved` with the `commentId` |
| Pushes updated content (existing "Update" flow) | `document:updated` with `updatedAt` timestamp |

**Known issue: bulk KV comment deletion.** The current `clearPendingComments` action deletes ALL comments for a share from KV when the host dismisses the last locally-visible comment. With real-time delivery, comments may arrive between the host's last fetch and the delete call, causing data loss. This must be addressed before implementation — either by switching to per-comment deletion or by deferring KV cleanup until confirmed catch-up.

**Limitation: active-tab-only reconnect catch-up.** On reconnect, the host catches up from KV only for the active tab's shares. Comments on background tabs with active shares remain stale until the user switches to that tab (which triggers a KV fetch). This is a known v1 limitation — the existing `fetchAllPendingComments` is active-tab-scoped and refactoring it to iterate all tabs is deferred.

#### Peer flow

1. Peer opens a shared link, content loads from KV (unchanged).
2. After content loads, the app opens the WebSocket and subscribes to the share's `docId`.
3. Incoming messages:

| Message | Peer action |
|---------|-------------|
| `comment:resolved` | Remove the comment from the peer's view |
| `document:updated` | Show notification: "Document updated. Click to refresh." |
| `comment:added` (from another peer) | Add to `remotePeerComments` (separate from the current peer's own comments to avoid double-posting to KV) |

4. When the peer adds a comment:
   a. POST to KV (existing async flow, for persistence).
   b. Broadcast `comment:added` via the WebSocket (for real-time delivery to host and other peers).

#### Disconnection / fallback

1. If the WebSocket fails to connect or disconnects, `rtStatus` goes to `"disconnected"`.
2. The app continues working in async mode — KV polling for comments (existing behavior).
3. Reconnection is attempted with exponential backoff (1s, 2s, 4s, 8s, max 30s).
4. On reconnect, the peer catches up via two steps:
   a. **Re-fetch comments from KV** (`GET /comments/:docId`) — catches missed `comment:added` events. Decrypt and merge into `remotePeerComments`, deduplicating by comment ID. Comments already in `myPeerComments` or `submittedPeerCommentIds` are excluded to avoid importing the peer's own comments as "remote."
   b. **Re-fetch shared content** (`loadSharedContent()`) — catches missed `comment:resolved` events, **but only if the host has pushed updated content** since the resolve. Currently `mergeComment()` does not auto-push — the host must click "Push update." To make resolve recovery reliable, `mergeComment` should auto-push the affected share after resolving a comment. This is tracked as a required implementation change.
   This is the peer-specific catch-up path — it does not reuse the host-only `fetchAllPendingComments`.

### 5.4 UI

#### Connection status indicator

A small dot in the header, near the existing share controls:

```
┌──────────────────────────────────────────────────────┐
│  MarkReview   [file tree]    ● Connected    [Share]  │
│                              ○ Connecting...          │
│                              ○ Offline                │
└──────────────────────────────────────────────────────┘
```

- Green filled dot: WebSocket connected and at least one subscription active
- Yellow filled dot: WebSocket handshake in progress (connecting)
- Gray dot: disconnected — async fallback active. This happens when:
  - The Cloudflare Worker is unreachable (Worker down, DNS issue)
  - A network interruption drops the WebSocket (VPN reconnect, laptop sleep/wake)
  - The client exhausted reconnection attempts (after exponential backoff reaches 30s cap)
  - The browser is offline (`navigator.onLine === false`)

The indicator is only visible when the current tab has active shares (host mode) or in peer mode.

#### Content update notification (peer side)

When a `document:updated` message arrives:

```
┌─────────────────────────────────────────────┐
│  ⓘ Document updated. Click to refresh.      │
└─────────────────────────────────────────────┘
```

Appears as a persistent inline banner (not the existing `toast` field, which is a plain string). The banner needs its own state field (`documentUpdateAvailable: boolean`) and a dedicated `ContentUpdateBanner` component that renders above the document view and calls `loadSharedContent()` on click. The existing `toast` infrastructure does not support click actions.

## 6. Interfaces

### 6.1 Durable Object — Relay Hub

A single DO class acts as the relay hub. All clients connect to one instance. The DO uses **socket attachments** (`serializeAttachment`/`deserializeAttachment`) to persist per-connection subscription state across hibernation. On each message, the DO scans `state.getWebSockets()` and checks attachments to find subscribers for the target `docId`. This is O(connections) per message but fine for 2–5 concurrent peers.

```typescript
// worker/src/relay.ts

export class RelayHub implements DurableObject {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // Accept with no attachments initially — attachments added on subscribe
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Parse message — the DO sees plaintext control frames and relay frames
    // For relay frames, docId is plaintext but payload is encrypted (opaque)
    // Use state.getWebSockets() + deserializeAttachment to find subscribers for docId
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    // No manual cleanup needed — Hibernation API tracks connections automatically
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    ws.close();
  }
}
```

### 6.2 Worker routing addition

```typescript
// In the existing worker fetch handler, before REST routes:

// WebSocket upgrade: /relay
if (resource === "relay" && !docId) {
  const upgradeHeader = req.headers.get("Upgrade");
  if (upgradeHeader !== "websocket") {
    return errRes(426, "WebSocket upgrade required", cors);
  }
  // Single hub instance — always the same name
  const hubId = env.RELAY_HUB.idFromName("hub");
  const hub = env.RELAY_HUB.get(hubId);
  return hub.fetch(req);
}
```

### 6.3 Client relay service

```typescript
// src/services/relay.ts

interface RelayConnection {
  /** Subscribe to a docId's events. Requires the share's encryption key for that doc. */
  subscribe(docId: string, key: CryptoKey): void;

  /** Unsubscribe from a docId. */
  unsubscribe(docId: string): void;

  /** Send a message to all other subscribers of a docId. */
  send(docId: string, msg: RelayMessage): Promise<void>;

  /** Close the WebSocket and clean up. */
  close(): void;
}

/** Opens a single WebSocket to the relay hub. */
function connectRelay(
  onMessage: (docId: string, msg: RelayMessage) => void,
  onStatusChange: (status: "connecting" | "connected" | "disconnected") => void,
  onSubscribeResult: (docId: string, ok: boolean) => void,
): RelayConnection;
```

The service handles:
- Single WebSocket lifecycle (open, close, reconnect with backoff)
- Tracking encryption keys per docId (set on subscribe, cleared on unsubscribe)
- Encrypting outbound messages with the correct share key for the target docId
- Decrypting inbound messages using the key for the frame's docId
- Calling `onMessage(docId, msg)` for each valid decrypted message
- Debounced sending: collects events within a 500ms window before flushing (individual frames, delayed to prevent bursts)
- Discarding messages for docIds the client doesn't have a key for (stale frames)

### 6.4 Wrangler config addition

```toml
# Added to worker/wrangler.toml

[[durable_objects.bindings]]
name = "RELAY_HUB"
class_name = "RelayHub"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["RelayHub"]
```

## 7. Acceptance Criteria

1. When a peer adds a comment while the host is connected, the comment appears in the host's pending comments within 2 seconds.
2. When the host resolves a comment, the peer sees it removed within 2 seconds.
3. When the host pushes updated content, connected peers see a notification within 2 seconds.
4. When the WebSocket connection fails, the app falls back to async KV mode automatically for the active tab. Comment loss is minimized. Background tabs with active shares catch up when the user switches to them — see §5.3 (host flow) and §9 (limitations) for details.
5. When a peer reconnects after a disconnection, they fetch the latest state from KV to catch up on missed events.
6. The connection status indicator accurately reflects the current WebSocket state.
7. All relay messages are encrypted with the share's AES-256-GCM key — the DO never sees plaintext.
8. When no messages are flowing, the DO uses WebSocket Hibernation to minimize duration charges. The 30-second ping/pong keep-alive incurs low but non-zero idle cost.
9. The existing async KV comment flow (post, fetch, merge) continues to work identically whether or not the WebSocket is connected.
10. The WebSocket connects over standard HTTPS (port 443), making it much more likely to work through corporate VPNs than the previous WebRTC approach. The async KV fallback covers cases where WebSocket is also blocked.

## 8. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Durable Object free tier limits change | Feature stops working | Monitor Cloudflare announcements; the async KV fallback always works |
| WebSocket blocked by specific VPN/proxy configs | No real-time, but app still works | Graceful fallback to async KV mode; no user-facing errors |
| Message ordering issues across relay + KV | Duplicate or out-of-order comments | Deduplicate by comment ID; KV is source of truth on reconnect |
| DO cold start latency | First connection after idle may take 200–500ms | Acceptable for comment sync; not latency-critical |
| Encryption key mismatch (stale page, different share) | Messages can't be decrypted | Discard undecryptable messages silently; log warning |
| Relay/KV message reordering | `comment:resolved` via relay arrives before `comment:added` via KV catch-up — resolve is a no-op, then add creates a zombie comment | Track resolved comment IDs in a `resolvedCommentIds` set; skip `comment:added` for IDs already resolved |

## 9. Limitations

- **Real-time only when both parties are online.** If the peer comments while the host is offline, comments go to KV only — same as current behavior.
- **No message history in the DO.** The relay is stateless — it only forwards messages to currently connected clients. KV is the persistence layer.
- **Single DO instance.** All clients connect to one relay hub. Fine for 2–5 peers but would need sharding if scaled to many concurrent users.
- **Free tier ceiling.** 100K DO requests/day with 20:1 WebSocket ratio = ~2M messages/day. More than sufficient for comment sync but sets an upper bound.
- **No offline queue.** If the WebSocket is disconnected, real-time messages are lost. The KV persistence layer covers this — comments posted during disconnection are stored in KV and fetched on reconnect.
- **Host reconnect catch-up is active-tab-only.** On reconnect, only the active tab's shares are refreshed from KV. Background tabs catch up when the user switches to them. This means a host with multiple shared tabs may see stale comments on non-active tabs until they switch.

## 10. Request Optimization Strategies

These strategies keep WebSocket message volume low to stay well within the free tier:

| Strategy | How | Saving |
|----------|-----|--------|
| Minimal keep-alive | Client sends a lightweight ping every 30s to survive VPN proxy idle timeouts. The DO responds with pong. No application-level polling beyond this. | 2 messages/30s when idle (negligible) |
| Echo suppression | DO does not relay a message back to the sender. | 50% reduction in relay traffic |
| Debounced sending | Client collects events within a 500ms window before flushing. Prevents bursts from rapid comment additions. Individual events remain separate WebSocket frames. | Reduces burst traffic |
| Send diffs | Only the changed comment is sent, not the full comment list. Full state sync only on reconnect (via KV). | Minimal payload per event |
| Lazy connect | WebSocket opens only when the client has active subscriptions. Closes when all subscriptions are removed. Inactivity-based disconnect deferred to future optimization. | Zero connections when not sharing |
| KV dedup on reconnect | On reconnect, fetch from KV and deduplicate by comment ID against already-known comments. | No redundant processing |

## 11. Methodology

### Problem

The previous real-time implementation (WebRTC via Trystero + Yjs) failed because corporate VPN blocks both signaling relays and direct peer-to-peer connections. We needed an alternative transport that works through VPN.

### Approach

1. **Studied the failed attempt.** Retrieved the full removed implementation from git history (commits `061293e` through `ec90b13`, Feb 26–28 2026). Mapped out exactly what was tried: 4 signaling backends (Nostr, BitTorrent, MQTT, back to Nostr), STUN + free TURN servers, Yjs CRDT sync. Identified both failure points: signaling relays blocked, and WebRTC connections blocked.

2. **Found a working reference.** The [claude-duet](https://github.com/EliranG/claude-duet) project does peer-to-peer on VPN without issues. Fetched and analyzed its full networking stack to understand why.

3. **Identified the key difference.** claude-duet doesn't force WebRTC — when P2P fails, it falls back to WebSocket via Cloudflare Tunnel or a self-hosted relay. WebSocket over HTTPS (port 443) is much more likely to pass through VPN than WebRTC, since blocking it would break most web applications. The insight: don't try to fix WebRTC on VPN — use a server-mediated relay over standard HTTPS instead.

4. **Evaluated relay options.** Considered Supabase Realtime, Ably, Azure Web PubSub, Pusher, and Cloudflare Durable Objects. Chose DO because: the project already uses a Cloudflare Worker, the free tier is sufficient (100K requests/day with 20:1 WebSocket ratio = ~2M messages/day), WebSocket Hibernation minimizes cost, and it keeps infrastructure in one place.

5. **Dropped unnecessary complexity.** The old implementation used Yjs CRDT for conflict resolution. Analysis showed this is unnecessary: each comment author owns their comments, the host resolves them unilaterally, and simultaneous adds aren't conflicts. Plain JSON events are sufficient — zero new dependencies.

### Shortcuts taken

- **No presence in v1.** Presence indicators (who's online, cursor tracking) were part of the old v3 spec. Deferred to reduce scope — comment sync is the core value.
- **KV as source of truth.** Instead of building message history or state reconciliation in the DO, we rely on the existing KV layer for persistence and catch-up on reconnect. The DO is stateless — just a relay.

### Blockers resolved

- **"VPN blocks connections"** — reframed from "fix WebRTC" to "use a transport much more likely to pass through VPN" (WSS over HTTPS port 443).
- **"DO requires paid plan"** — initially believed this based on outdated information. User corrected with current Cloudflare docs showing DO is available on the free plan.
- **"WSS needs a server"** — true, but the existing Cloudflare Worker already is that server. Adding a DO class to it is minimal overhead.

## 12. References

| Source | What it provided |
|--------|-----------------|
| [Cloudflare Durable Objects docs](https://developers.cloudflare.com/durable-objects/) | Architecture, WebSocket Hibernation API, deployment configuration |
| [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) | Free tier limits: 100K requests/day, 13K GB-s/day, 20:1 WebSocket message ratio |
| [claude-duet (GitHub)](https://github.com/EliranG/claude-duet) | Reference implementation — WebRTC with WebSocket/tunnel fallback; demonstrated that relay-based approach works on VPN |
| Git history: commits `061293e`–`ec90b13` | Full source of the removed Trystero + Yjs WebRTC implementation; signaling backend evolution; failure analysis |
| [docs/features/realtime-collaboration.md](./realtime-collaboration.md) | Original v3 spec describing the WebRTC approach (now superseded) |
| [docs/design/v2-technical-design.md](../design/v2-technical-design.md) | Current async sharing architecture — Worker API, KV schema, encryption scheme, ShareStorage interface |
