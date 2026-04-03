# Real-Time Comment Sync — Technical Design

> Spec: [spec.md](./spec.md)
> Implementation plan: [todos.md](./todos.md)
> Review analysis: [review-analysis.md](./review-analysis.md)

---

## 1. Summary

Real-time comment delivery via a Cloudflare Durable Object WebSocket relay. Replaces the manual "Check comments" KV polling flow with instant comment delivery while keeping KV as the persistence and offline fallback layer.

**Scope (v1):** add + resolve only. Edit/delete deferred until KV supports per-comment mutation.

---

## 2. Why Not WebRTC

A previous attempt used browser-to-browser WebRTC (Trystero + Yjs, commits `061293e`–`ec90b13`). It failed because the product is used inside a corporate VPN that blocks:

1. Signaling relays — tried Nostr, BitTorrent, MQTT, back to Nostr over 3 days
2. Direct peer connections — even with STUN + free TURN servers

Analysis of [claude-duet](https://github.com/EliranG/claude-duet) showed the key insight: when P2P fails, fall back to a WebSocket relay over standard HTTPS. WSS on port 443 is much more likely to pass through VPN than WebRTC since blocking it would break most web applications.

---

## 3. Architecture

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

**Topology:** Single relay hub DO, multiplexed by `docId`. Each client opens one WebSocket. The DO routes messages by checking per-socket subscription attachments (`serializeAttachment`/`deserializeAttachment` — survives hibernation).

**Dual-layer:** Comments are posted to KV (persistence) AND broadcast via WebSocket (delivery). KV is the primary durable catch-up layer on reconnect, supplemented by transient `resolvedCommentIds` for relay/KV reorder protection within a session.

---

## 4. Tech Stack Additions

| Layer | Choice | Why |
|-------|--------|-----|
| Real-time relay | Cloudflare Durable Object (WebSocket Hibernation API) | Same platform as existing Worker; free tier sufficient; WSS passes through VPN |
| Wire protocol | JSON frames over WebSocket (plaintext docId + encrypted payload) | Simple, no dependencies; E2E encrypted with existing AES-256-GCM keys |
| Subscription state | Socket attachments | Survives DO hibernation without in-memory Maps |
| Keep-alive | Application-level ping/pong (30s) | Prevents VPN proxy idle timeouts |
| Client state | Zustand (existing store) | New fields on AppState root |

No new npm dependencies. Existing platform choices (Web Crypto, Cloudflare Worker + KV, GitHub Pages) remain unchanged.

---

## 5. Wire Protocol

### Outbound (client → DO)

| Frame | Fields | Encrypted |
|-------|--------|-----------|
| `SubscribeFrame` | `{ type: "subscribe", docId }` | No |
| `UnsubscribeFrame` | `{ type: "unsubscribe", docId }` | No |
| `PingFrame` | `{ type: "ping" }` | No |
| `RelayFrame` | `{ version: 1, docId, payload }` | `payload` is base64-encoded AES-256-GCM ciphertext |

### Inbound (DO → client)

| Frame | Fields | When |
|-------|--------|------|
| `SubscribeOkFrame` | `{ type: "subscribe:ok", docId }` | Subscribe confirmed |
| `ErrorFrame` | `{ type: "error", docId, message }` | Subscribe failed / other errors |
| `PongFrame` | `{ type: "pong" }` | Keep-alive response |
| `RelayFrame` | `{ version: 1, docId, payload }` | Message from another client |

### Relay message types (inside encrypted payload)

| Type | Direction | Purpose |
|------|-----------|---------|
| `comment:added` | peer → host | New comment posted |
| `comment:resolved` | host → peer | Comment merged/resolved |
| `document:updated` | host → peer | Host pushed updated content to KV |

---

## 6. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Single hub vs per-doc DO | Single hub | Avoids N WebSocket connections per client; host gets comments from all shares on one socket |
| Yjs CRDT vs plain events | Plain events | No concurrent editing — each author owns their comments; host resolves unilaterally |
| Subscribe ACK | `subscribe:ok` / `error` with retry | KV eventual consistency can reject valid subscriptions; client must not show false-connected state |
| Intentional close flag | `closedIntentionally` boolean | Distinguishes lazy disconnect from unexpected failure; prevents reconnect after deliberate close |
| Zombie comment prevention | `resolvedCommentIds` set (session-scoped) | Tracks resolved IDs so late-arriving `comment:added` (from KV catch-up) is skipped after a resolve. Session-scoped only — does not survive page reload. The durable protection is the auto-push: `mergeComment` pushes updated content to KV before broadcasting `comment:resolved`, so a reloading peer gets the resolved state from KV. See §8. |
| Peer reconnect catch-up | Fetch comments from KV + reload content | Two-step: KV catches missed adds, content reload catches missed resolves (requires host auto-push) |
| Host reconnect catch-up | Active tab only | `fetchAllPendingComments` is tab-scoped; background tabs catch up on switch (documented limitation) |

---

## 7. State Changes

### New AppState fields (global, not persisted)

```typescript
rtStatus: "disconnected" | "connecting" | "connected";
rtSocket: RelayConnection | null;
rtSubscriptions: Set<string>;
documentUpdateAvailable: boolean;
remotePeerComments: PeerComment[];
resolvedCommentIds: Set<string>;
```

### Existing fields reused

- `TabState.pendingComments: Record<string, PeerComment[]>` — host receives relay comments here
- `TabState.shares: ShareRecord[]` — `pendingCommentCount` updated on live delivery
- `myPeerComments` / `submittedPeerCommentIds` — peer's own comments (not touched by relay)

---

## 8. Required Pre-Implementation Changes

These must be done before the relay feature can ship safely:

1. **Per-comment KV deletion** — Add `DELETE /comments/:docId/:cmtId` to the Worker. Change `mergeComment`/`dismissComment` to delete only the resolved comment, not all comments for the share.

2. **Auto-push after resolve, before broadcast** — `mergeComment` must call `updateShare(docId)` after resolving and **before** broadcasting `comment:resolved`. This ordering ensures that if a peer reloads during the resolve window, the durable KV content already reflects the resolve. The relay broadcast is the notification; KV is the durable record.

---

## 9. New Files

| File | Purpose |
|------|---------|
| `src/types/relay.ts` | Wire protocol types and relay message types |
| `src/services/relay.ts` | `connectRelay()` — WebSocket lifecycle, encryption, batching, ping, reconnect |
| `worker/src/relay.ts` | `RelayHub` DO class — subscription routing, echo suppression, hibernation |
| `src/components/ConnectionStatus/` | Status dot indicator (connected/connecting/offline) |
| `src/components/ContentUpdateBanner/` | Persistent banner for `document:updated` notification |

---

## 10. Modified Files

| File | Change |
|------|--------|
| `worker/src/index.ts` | Add `/relay` WebSocket upgrade route; export `RelayHub`; add `RELAY_HUB` to `Env` |
| `worker/wrangler.toml` | Add DO binding and `new_sqlite_classes` migration |
| `src/store/index.ts` | Add relay state fields, actions (`openRelay`, `subscribeDoc`, `closeRelay`), message handlers |
| `src/store/selectors.ts` | Add `allVisiblePeerComments` selector combining `myPeerComments` + `remotePeerComments` |
| `src/services/shareSync.ts` | Broadcast `document:updated` in `updateShare` |
| `src/store/index.ts` (continued) | Broadcast `comment:added` after KV post in `syncPeerComments`; broadcast `comment:resolved` in `mergeComment` (after auto-push) |
| `src/components/Header/Header.tsx` | Wire `ConnectionStatus`; hide "Check comments" when connected |
| `src/components/CommentPanel/CommentPanel.tsx` | Read combined selector in peer mode |
| `src/components/CommentMargin/CommentMargin.tsx` | Show margin dots for remote peer comments |

---

## 11. Known Limitations

- **v1 scope: add + resolve only.** Edit/delete deferred until KV supports per-comment mutation.
- **Host reconnect is active-tab-only.** Background tabs catch up on switch.
- **Single DO instance.** Fine for 2–5 peers; needs sharding if scaled.
- **Peer resolve recovery requires auto-push.** If the host hasn't pushed updated content after resolving, `loadSharedContent()` won't reflect the resolve.
- **VPN compatibility is "much more likely" not "guaranteed."** Some proxies may still interfere with WebSocket upgrades.

---

## 12. Cost Estimate (Free Tier)

| Resource | Limit | Expected usage |
|----------|-------|----------------|
| DO requests/day | 100,000 (20:1 WS ratio = ~2M messages) | ~200–500 messages/hour per active session |
| DO duration/day | 13,000 GB-s | Low — Hibernation API minimizes wakeups; 30s ping adds ~2 msg/30s idle cost |
| KV reads/day | 100,000 | Unchanged from v2 + reconnect catch-up reads |
| KV writes/day | 1,000 | Unchanged from v2 (comment persistence) |

Well within free tier for the 2–5 peer target.
