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

Every new client subscription has a generated `subscriptionId`. The client adds
it to subscribe and comment operations; the Durable Object echoes the recipient's
ID on responses, snapshots, and forwarded events. A response carrying an older
ID is ignored. Missing IDs remain accepted for the deployment compatibility
window.

The client serializes all snapshot and live-event work per
`(docId, subscriptionId)`. Decryption may be asynchronous, but later events do
not commit before earlier ones. Worker errors are scoped to either the whole
subscription or one operation so one rejected comment cannot falsely take the
document offline.

Generation-aware snapshots are chunked below the inbound frame ceiling. Each
chunk carries `snapshotId`, `chunkIndex`, and `chunkCount`; the client applies
the reassembled bounded snapshot atomically. The Durable Object also caps one
document at 500 unresolved rows and 8 MiB of encoded payload text, preventing a
valid collection of rows from becoming an unbounded reconnect allocation.

## 6. Client State Shape

### Host tab state

Existing `TabState` fields remain the source of host review state:

- `workspaceId`
- `pendingComments`
- `pendingResolveCommentIds`
- `shares`
- `shareKeys`
- `incomingReviewSessions`

`incomingReviewSessions[docId]` records the owning workspace, current host
subscription generation and phase, and bounded quarantine notices. Share
ownership is keyed by `workspaceId`, not a display name or whichever tab happens
to be active.

### Global store state

- `relayStatus`
- `documentUpdateAvailable`
- `peerSubmissionSubscription`
- peer-mode share content fields
- `peerDraftCommentOpen`
- `myPeerComments`
- `submittedPeerCommentIds`

The WebSocket instance, reconnect timer, ordered event queues, and bounded
content-free diagnostics stay in `src/modules/relay/controller.ts` and
`src/modules/relay/diagnostics.ts`, not in the Zustand store.

### Local persistence boundaries

- `markreview-shares-v2` binds each `docId` to its stable `workspaceId`. Legacy
  name-based records are copied only when ownership is unambiguous; ambiguous
  records remain unbound and the old registry is retained.
- `markreview-resolve-outbox-v1` is a dedicated durable outbox. Merge, dismiss,
  clear, and quarantine dismissal persist a resolve ID before hiding the item.
- document text is stored in a per-workspace content cache instead of the root
  Zustand blob. Relay inbox updates therefore do not rewrite every open
  document's content.
- all local-storage adapters contain quota and availability failures. A storage
  exception becomes an explicit failed action or warning, not an uncaught render
  failure.

## 7. Core Interaction Flows

### 7.0 Host share dialog open

1. Host clicks `Share file` or `Share folder`.
2. The UI opens the dialog from a lightweight scope descriptor.
3. Top-level folder share does not eagerly rebuild or walk the full folder subtree before the dialog paints.
4. Live-tree traversal and file reads happen only after the user confirms `Generate link`.

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
3. DO immediately sends `comments:snapshot` carrying that subscription's ID.
4. Client decrypts and applies it on that subscription's ordered queue before
   processing later live events.
5. Locally queued resolve IDs are filtered out so reconnect does not resurrect comments already removed in this session.

### 7.3 Host merge / dismiss

1. For merge, the client resolves the share's exact owning tab and captures its
   file target, path, content, and SHA-256 hash.
2. It builds a merge only if the current block/range anchor is still valid. A
   deterministic `mr-peer-{commentId}` metadata ID makes retries idempotent.
3. Immediately before writing, it rereads the file and rechecks the captured
   owner/path/target and hash. Any mismatch fails closed.
4. After a successful write, or before a dismiss/clear, the client persists the
   comment ID to the resolve outbox. Only then does it remove the item from the
   visible pending state.
5. The ID is also represented in `pendingResolveCommentIds` for compatibility
   with older persisted state.
6. `flushPendingCommentResolves()` sends `comment:resolve` for queued IDs once the relay is confirmed.
7. DO deletes the row from SQLite.
8. DO replies with `comment:resolve:ack`.
9. Client durably removes the outbox entry, then removes the compatibility queue entry.
10. DO broadcasts `comment:resolved` to subscribers.

### 7.4 Invalid input containment

1. The Worker rejects oversized frames, invalid IDs, unauthorized role actions,
   and rate-limit excess before storage or fan-out.
2. The client validates decrypted external data once at the relay boundary.
3. An invalid host item becomes a bounded, content-free quarantine record for
   its document; valid items in the same snapshot still apply.
4. Review surfaces are wrapped per document/group so one render failure exposes
   a retry fallback without replacing the whole tab.

### 7.5 Peer content refresh

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

- [worker/src/index.ts](../../../worker/src/index.ts)
  - share content CRUD
  - relay route
  - share revoke clearing relay state
- [worker/src/relay.ts](../../../worker/src/relay.ts)
  - SQLite schema
  - subscribe auth
  - ACK / snapshot / forward behavior
- [worker/wrangler.toml](../../../worker/wrangler.toml)
  - `RelayHubSqlite` binding and migration

### Client

- [src/modules/relay/controller.ts](../../../src/modules/relay/controller.ts)
  - WebSocket lifecycle
  - subscribe resend
  - ping/pong
  - ACK handling
  - generation filtering and ordered snapshot/live dispatch
- [src/modules/relay/diagnostics.ts](../../../src/modules/relay/diagnostics.ts)
  - bounded content-free relay diagnostics
- [src/store/index.ts](../../../src/store/index.ts)
  - module composition and compatible root-state migration
- [src/modules/sharing/registry.ts](../../../src/modules/sharing/registry.ts)
  - stable workspace-to-share ownership and additive legacy migration
- [src/modules/sharing/resolveOutbox.ts](../../../src/modules/sharing/resolveOutbox.ts)
  - durable resolve intent before UI removal
- [src/modules/workspace/contentCache.ts](../../../src/modules/workspace/contentCache.ts)
  - per-workspace document-content persistence
- [src/services/shareStorage.ts](../../../src/services/shareStorage.ts)
  - share content CRUD only
- [src/services/shareSync.ts](../../../src/services/shareSync.ts)
  - content push + `document:updated`

## 9. Operational Notes

- one relay hub is acceptable for the current scale
- unresolved comments are durable in SQLite until resolve, revoke, or expiry
- peer drafts remain local if relay subscribe is not yet confirmed
- host-authored local comments stay outside this system entirely
- WebSocket keep-alive is still application-level ping/pong every 30 seconds
- plain WebSocket frames are capped at 1.5 MiB; encrypted comment payloads are
  capped at 1 MiB; comment text and quote text are capped at 400 KiB each
- comment writes are rate-limited per socket
- generation-aware snapshots are chunked below the frame limit and one
  document's unresolved inbox is capped at 500 rows / 8 MiB encoded payload

## 10. Non-Goals

- syncing host-local `question:` / `answer:` threads through the relay
- collaborative peer-to-peer comment thread rendering
- peer self-delete after submit
- submitted comment edit flow
- presence and collaboration cursors
- moving encrypted share content out of KV
