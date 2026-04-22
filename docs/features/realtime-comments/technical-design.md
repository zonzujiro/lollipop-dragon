# Real-Time Comment Sync — Technical Design

> Spec: [spec.md](./spec.md)
> Review log: [review-analysis.md](./review-analysis.md)

## 1. Summary

The implementation uses a SQLite-backed Durable Object (`RelayHubSqlite`) as the only durable backend for unresolved peer comments.

- KV still stores encrypted share content and share metadata
- the Durable Object stores unresolved peer comment payloads
- host reconnect is restored from `comments:snapshot`
- host resolves remove rows from SQLite
- host-authored local comments never enter the relay store

This is a deliberate replacement of the old KV comment API, not an addition to it.

## 2. Runtime Topology

```text
Host Browser  ─┐
               ├── WebSocket /relay ── RelayHubSqlite
Peer Browser  ─┘                         - SQLite comment store
                                         - subscribe auth
                                         - add / resolve ACKs
                                         - comments:snapshot

Host / Peer ───── HTTPS /share/:docId ─ Worker + KV
                                         - encrypted content blob
                                         - share metadata
                                         - revoke / update
```

## 3. Worker Responsibilities

### KV

- `share:{docId}` stores encrypted share content
- `share:{docId}:meta` stores:
  - `hostSecretHash`
  - `createdAt`
  - `updatedAt`
  - `ttl`
  - `label`

### Durable Object

`RelayHubSqlite` owns unresolved peer comments and relay routing.

SQLite tables:

`doc_meta`
- `doc_id`
- `host_secret_hash`
- `expires_at`

`comments`
- `doc_id`
- `cmt_id`
- `payload`
- `created_at`
- `expires_at`

Important properties:

- `cmtId` is client-generated and used as the primary durable identifier
- payload is stored encrypted
- expiry follows the share TTL
- DO alarms delete expired comment rows
- share revoke clears both `comments` and `doc_meta` for the share

## 4. Auth And Roles

The relay distinguishes host and peer sockets at subscribe time.

### Host subscribe

- frame includes `role: "host"` and `hostSecret`
- DO hashes `hostSecret` and compares it to `share:{docId}:meta.hostSecretHash`
- only verified host sockets are allowed to send `comment:resolve`

### Peer subscribe

- frame includes `role: "peer"`
- no host secret required
- peer sockets can send `comment:add`

This is lightweight role enforcement, not a full identity system.

## 5. Wire Contract

### Plaintext control frames

- `subscribe`
- `unsubscribe`
- `ping`
- `comment:add`
- `comment:resolve`

### Inbound frames from the DO

- `subscribe:ok`
- `error`
- `pong`
- `comment:add:ack`
- `comment:resolve:ack`
- `comments:snapshot`
- `comment:added`
- `comment:resolved`

### Encrypted message payloads

- `document:updated`

The relay also validates that the decrypted peer comment payload `id` matches the frame `cmtId`. That keeps frame identity authoritative and prevents ID drift.

## 6. Client State Shape

### Host tab state

Existing `TabState` fields remain the source of host review state:

- `pendingComments`
- `pendingResolveCommentIds`
- `shares`
- `shareKeys`

### Global store state

- `relayStatus`
- `documentUpdateAvailable`
- peer-mode share content fields
- `peerDraftCommentOpen`
- `myPeerComments`
- `submittedPeerCommentIds`

The WebSocket instance and timers stay in `src/services/relay.ts`, not in the Zustand store.

## 7. Core Interaction Flows

### 7.1 Peer add

1. Peer creates a local `PeerComment`.
2. `syncPeerComments()` finds unsent local comments across the shared document, not only the currently open peer file.
3. `relayCommentAdd()` encrypts the comment and sends `comment:add`.
4. DO persists the row with `INSERT OR IGNORE`.
5. DO sends `comment:add:ack`.
6. Client marks the comment as submitted.
7. DO forwards `comment:added` to host sockets for that `docId`.

### 7.2 Host subscribe / reconnect

1. Host opens relay and subscribes with `hostSecret`.
2. DO verifies host role and responds `subscribe:ok`.
3. DO immediately sends `comments:snapshot`.
4. Client decrypts each entry and calls `replaceCommentsSnapshot`.
5. Locally queued resolve IDs are filtered out so reconnect does not resurrect comments already removed in this session.

### 7.3 Host merge / dismiss

1. Host removes the comment from pending review state.
2. Host queues the comment ID in `pendingResolveCommentIds`.
3. `flushPendingCommentResolves()` sends `comment:resolve` for queued IDs once the relay is confirmed.
4. DO deletes the row from SQLite.
5. DO replies with `comment:resolve:ack`.
6. Client removes the queued resolve entry.
7. DO broadcasts `comment:resolved` to subscribers.

### 7.4 Peer content refresh

1. Host updates encrypted share content through `updateShare()`.
2. Host sends encrypted `document:updated`.
3. If the peer has no local comment work in progress, the client refreshes shared content automatically.
4. If the peer has local unsent comments or an open draft comment form, the client sets `documentUpdateAvailable` instead of reloading immediately.
5. While `documentUpdateAvailable` is true, the peer cannot submit comments against the older snapshot.
6. `ContentUpdateBanner` is the blocking refresh path for that stale state and calls `loadSharedContent({ discardUnsubmitted: true })`.
7. On reconnect, the client first checks the share's latest `Last-Modified` value via `HEAD /share/:docId` and then applies the same safe auto-refresh rule instead of unconditionally reloading content.

Obsolete note:

- The older banner-only manual-refresh flow is obsolete.
- The older always-visible peer-side `Get latest` button is obsolete.

## 8. File Responsibilities

### Worker

- [worker/src/index.ts](/home/zonzujiro/projects/lollipop-dragon/worker/src/index.ts)
  - share content CRUD
  - relay route
  - share revoke clearing relay state
- [worker/src/relay.ts](/home/zonzujiro/projects/lollipop-dragon/worker/src/relay.ts)
  - SQLite schema
  - subscribe auth
  - ACK / snapshot / forward behavior
- [worker/wrangler.toml](/home/zonzujiro/projects/lollipop-dragon/worker/wrangler.toml)
  - `RelayHubSqlite` binding and migration

### Client

- [src/services/relay.ts](/home/zonzujiro/projects/lollipop-dragon/src/services/relay.ts)
  - WebSocket lifecycle
  - subscribe resend
  - ping/pong
  - ACK handling
  - snapshot decrypt / dispatch
- [src/store/index.ts](/home/zonzujiro/projects/lollipop-dragon/src/store/index.ts)
  - host pending comment state
  - queued resolve state
  - peer submission state
- [src/services/shareStorage.ts](/home/zonzujiro/projects/lollipop-dragon/src/services/shareStorage.ts)
  - share content CRUD only
- [src/services/shareSync.ts](/home/zonzujiro/projects/lollipop-dragon/src/services/shareSync.ts)
  - content push + `document:updated`

## 9. Operational Notes

- one relay hub is acceptable for the current scale
- unresolved comments are durable in SQLite until resolve, revoke, or expiry
- peer drafts remain local if relay subscribe is not yet confirmed
- host-authored local comments stay outside this system entirely
- WebSocket keep-alive is still application-level ping/pong every 30 seconds

## 10. Non-Goals

- collaborative peer-to-peer comment thread rendering
- peer self-delete after submit
- submitted comment edit flow
- presence and collaboration cursors
- moving encrypted share content out of KV
