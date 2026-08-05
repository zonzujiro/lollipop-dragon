# MarkReview — Real-Time Comment Sync

> Technical design: [technical-design.md](./technical-design.md)
> Review log: [review-analysis.md](./review-analysis.md)

## 1. Overview

Real-time comment sync uses a Cloudflare Durable Object as the only backend for unresolved peer comments. Share content stays in KV, but comment delivery, reconnect recovery, and comment durability no longer use the old `/comments/*` KV API.

Current model:

- peer comments are stored in `RelayHubSqlite`
- host receives peer comments over WebSocket without manual fetch
- host resolves peer comments through the relay, which removes them from Durable Object storage
- peer content refresh still comes from KV share content, with `document:updated` as a live notification

Host-authored local comments remain local-only. They are merged directly into the host document and are never sent through the relay comment store.

## 2. User Stories

- As a host sharing a document, I want peer comments to appear automatically so I do not need to click a manual fetch action.
- As a host reviewing feedback, I want incoming peer comments in the normal
  Comments panel so review work is not hidden inside share management.
- As a host reviewing incoming comments, I want merge and dismiss actions to remove the comment from reconnect snapshots so it does not come back later.
- As a host merging incoming feedback, I want the reviewer's name to remain the
  comment author so ownership does not change to me after the file is reparsed.
- As a peer leaving feedback, I want submitted comments to be acknowledged only after the backend stores them durably.
- As a peer with unsent feedback, I want Submit comments to remain a prominent,
  counted primary action until my feedback is sent.
- As a host reconnecting after a disconnect, I want the current unresolved comment set restored from the backend without merge-by-ID heuristics.
- As a host receiving a snapshot while comments are also arriving live, I want
  both inputs applied in relay order so a late snapshot cannot erase newer
  feedback.
- As a host with two workspaces that have the same display name, I want each
  share to stay attached to the workspace that created it.
- As a host merging feedback after the file changed, I want the merge to stop
  instead of writing a comment onto the wrong text or wrong tab.
- As a host receiving malformed or oversized feedback, I want that item isolated
  while the rest of the review session remains usable.
- As a peer reopening a shared document, I want the document content to reload cleanly and I want previously submitted comments to avoid duplicate submission.
- As a peer reconnecting with unsent comments on multiple shared files, I want all unsent comments retried instead of only the currently open file.
- As a peer viewing a shared document with no local comment work in progress, I want newer shared content to load automatically so I stay on the latest version.
- As a peer with local unsent comment work, I want automatic refresh to stop so I do not keep reviewing against content that just changed.
- As a host adding my own local comments, I want them to stay private and local because they are already part of my working copy.

## 3. Scope

### Included

- SQLite-backed Durable Object storage for unresolved peer comments
- WebSocket relay at `/relay`
- `comment:add` and `comment:resolve` control flow with ACKs
- `comments:snapshot` on host subscribe/reconnect
- host/peer role distinction on subscribe
- `ConnectionStatus` UI for relay state
- `ContentUpdateBanner` for peer-side stale-content notification when auto-refresh is blocked
- encrypted share content in KV
- encrypted comment payloads over the relay

### Excluded

- `/comments/*` REST API
- KV-based comment polling or comment catch-up
- peer-to-peer WebRTC transport
- syncing host-local `question:` / `answer:` threads through the relay
- remote rendering of other peers' comments in peer mode
- real-time edit/delete of already-submitted peer comments
- presence, cursors, typing indicators
- syncing host-authored local comments through the relay

## 4. Architecture

```text
Host Browser  ── WSS ──┐
                       │
Peer Browser  ── WSS ──┼── RelayHubSqlite Durable Object
                       │     - SQLite comment store
                       │     - subscribe ACK
                       │     - comments:snapshot
                       │     - comment add / resolve ACK
                       │
Host / Peer  ─ HTTPS ──┴── Worker + KV
                             - encrypted share content
                             - share metadata
                             - host secret verification
```

Key decisions:

- single relay hub Durable Object, multiplexed by `docId`
- one WebSocket per client
- unresolved peer comments are durable in DO SQLite, not KV
- comment payloads stay encrypted end-to-end
- host role is verified with `hostSecret`

## 5. Data Model

### Worker / KV

- `share:{docId}` — encrypted share content blob
- `share:{docId}:meta` — share metadata:
  - `hostSecretHash`
  - `createdAt`
  - `updatedAt`
  - `ttl`
  - `label`

### Durable Object / SQLite

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

`cmtId` is the canonical comment identifier across the relay and stored comment rows.

## 6. Wire Protocol

### Plaintext control frames

- `subscribe { docId, role, hostSecret?, subscriptionId? }`
- `unsubscribe { docId, subscriptionId? }`
- `ping`
- `comment:add { docId, cmtId, payload, subscriptionId? }`
- `comment:resolve { docId, cmtId, subscriptionId? }`

### DO responses

- `subscribe:ok`
- `error`
- `pong`
- `comment:add:ack`
- `comment:resolve:ack`
- `comments:snapshot`
- `comment:added`
- `comment:resolved`

`subscriptionId` identifies one client-side subscription generation. The DO
echoes it on subscription responses, snapshots, acknowledgements, forwarded
events, and subscription-scoped errors. Clients ignore responses for older
generations. It remains optional so clients and Durable Objects can be deployed
independently during the compatibility window.

For generation-aware clients, `comments:snapshot` also carries `snapshotId`,
`chunkIndex`, and `chunkCount`. The host buffers bounded chunks and applies the
snapshot only after all chunks arrive. Legacy clients without a subscription ID
continue to receive the original single-frame snapshot during the compatibility
window.

Errors distinguish `scope: "subscription"` from `scope: "operation"`.
Subscription errors fail that document subscription. An operation error rejects
only the referenced comment operation, is shown to the initiating user, and does
not tear down an otherwise live subscription.

### Encrypted relay payloads

- `document:updated`

Peer comment payloads are encrypted before they are sent in `comment:add`. The DO stores the encrypted payload string directly and does not inspect comment content.

## 7. Core Flows

### Share creation

1. Host generates share key and `hostSecret`.
2. Host uploads encrypted content to `POST /share/:docId`.
3. Worker stores share content + metadata in KV.
4. Host subscribes to `/relay` as `role: "host"` with `hostSecret`.

Opening the host share dialog is not part of share creation itself. For folder shares, the UI should open from a lightweight "current folder" intent and defer live-tree traversal plus file-content reads until the user confirms `Generate link`.

### Peer comment submit

1. Peer drafts a local `PeerComment`.
2. Peer sync sends `comment:add { docId, cmtId, payload }`.
3. DO verifies subscription and share expiry.
4. DO stores the encrypted payload in SQLite.
5. DO sends `comment:add:ack` to the sender.
6. DO forwards `comment:added` to subscribed host sockets.

### Host reconnect / initial subscribe

1. Host subscribes with `role: "host"`.
2. DO verifies `hostSecret`.
3. DO replies with `subscribe:ok`.
4. DO sends `comments:snapshot` containing the full unresolved set for that `docId`.
5. Host applies the snapshot on the subscription's ordered event queue, filtered
   against locally queued resolves. Later `comment:added` events cannot be
   overtaken by a slow snapshot decrypt.

### Host merge / dismiss

1. Host opens the Comments panel. Incoming feedback is the initial view when
   unresolved peer comments exist.
2. Host merges or dismisses a peer comment from its incoming card.
3. For a merge, the host verifies the owning workspace, file target, current
   content hash, and anchor before writing. The deterministic embedded comment
   ID makes retry idempotent.
4. Host durably queues the resolve locally before removing it from current
   pending UI state, then flushes `comment:resolve`.
5. DO deletes the comment row from SQLite.
6. DO sends `comment:resolve:ack` to the host.
7. DO broadcasts `comment:resolved` to subscribers.
8. Peers remove the matching submitted comment from their local view.

### Document content update

1. Host pushes new encrypted share content to KV.
2. Host sends encrypted `document:updated`.
3. If the peer has no local unsent comment work, the app refreshes shared content automatically.
4. If the peer has local unsent comment work, the app marks the view stale and shows `ContentUpdateBanner`.
5. While stale, the peer cannot continue submitting comments against the older snapshot.
6. Refreshing from the banner reloads share content from KV and discards unsent peer comments that were tied to the older snapshot.

Obsolete note:

- The older banner-only manual-refresh model is obsolete.
- The older always-visible peer-side `Get latest` button is also obsolete.
- The canonical behavior is now safe auto-refresh: auto-refresh when there is no local peer comment work, otherwise block on refresh.

## 8. Acceptance Criteria

1. A connected host receives a peer comment without using a manual fetch action.
2. A reconnecting host receives a full unresolved snapshot from the Durable Object.
3. A resolved or dismissed peer comment no longer appears in later host snapshots for that share.
4. A peer comment is marked submitted only after `comment:add:ack`.
5. Peer-side content updates use safe auto-refresh without changing the encrypted share-content model.
6. Host-only resolve authority is enforced by `hostSecret` on subscribe.
7. Reconnect resend includes unsent peer comments across all shared files, not only the currently open peer file.
8. Host-authored local comments are never inserted into Durable Object comment storage.
9. Incoming counts appear on the Comments action and inside the Comments panel;
   the Share sheet does not contain the review list.
10. Open-comment type filters retain their counts and selection while the host
    views Incoming or Resolved comments.
11. When unsent peer comments exist, Submit comments uses the primary button
    treatment, shows a separate count, and remains labeled through the tablet
    header breakpoint.
12. `ConnectionStatus` reports Live only after the visible document's current
    subscription generation is confirmed; a connected socket alone is not Live.
13. A slow snapshot cannot erase a later live comment from the same subscription.
14. Two same-named workspaces keep distinct share ownership through stable
    workspace IDs. An ambiguous legacy name-based share is left unbound.
15. Merge targets the share-owning tab and fails closed if its file, content, or
    anchor changed while the operation was pending. Retrying a completed merge
    does not insert a duplicate comment.
16. A resolve is persisted locally before its comment disappears from the UI, so
    reload or reconnect cannot resurrect a locally completed review action.
17. One invalid encrypted comment is quarantined and surfaced as a bounded
    notice; valid comments and the rest of the application remain usable.
18. Relay frames, IDs, encrypted payloads, comment text, and quote text are
    bounded and malformed values are rejected at the network boundary.
19. A reconnect snapshot larger than one safe relay frame is delivered in
    ordered chunks and applied atomically before later live events.

## 9. Limitations

- The relay comment store tracks unresolved peer comments only.
- Peer mode does not render other peers' comments as a collaborative thread.
- Real-time edit/delete of submitted peer comments is out of scope.
- A single relay hub is sufficient for the current scale but not intended for large fan-out.
- `document:updated` is a live notification, not a durable event log. Share content itself remains durable in KV.
- Peer comment submission depends on relay connectivity. Unsynced peer drafts stay local until relay subscribe succeeds.
- Plain relay frames are capped at 1.5 MiB and encrypted comment payloads at
  1 MiB. New peer comment and quote fields are capped at 400 KiB each. The
  earlier peer-sharing statement that selection length had no maximum is no
  longer valid because an unbounded client payload can crash a host tab.
- The relay rate-limits comment writes per socket. This is abuse containment,
  not peer identity or account authentication.
- Each document is bounded to 500 unresolved comments and 8 MiB of encoded
  encrypted comment payloads. A peer receives an operation error when the inbox
  is full; the confirmed subscription remains live.

## 10. Why This Replaced The Old Model

The old design split comments across two backends:

- KV for persistence
- WebSocket relay for real-time delivery

That created avoidable complexity:

- comment ID drift between KV and relay
- stale KV reads resurrecting dismissed comments
- tombstone bookkeeping
- merge-vs-replace reconciliation bugs
- retry logic for per-comment KV deletion

The current design removes that split. Comments now have one durable source of truth: the Durable Object SQLite store.
