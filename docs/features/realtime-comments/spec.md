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
- As a host reviewing incoming comments, I want merge and dismiss actions to remove the comment from reconnect snapshots so it does not come back later.
- As a peer leaving feedback, I want submitted comments to be acknowledged only after the backend stores them durably.
- As a host reconnecting after a disconnect, I want the current unresolved comment set restored from the backend without merge-by-ID heuristics.
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

- `subscribe { docId, role, hostSecret? }`
- `unsubscribe { docId }`
- `ping`
- `comment:add { docId, cmtId, payload }`
- `comment:resolve { docId, cmtId }`

### DO responses

- `subscribe:ok`
- `error`
- `pong`
- `comment:add:ack`
- `comment:resolve:ack`
- `comments:snapshot`
- `comment:added`
- `comment:resolved`

### Encrypted relay payloads

- `document:updated`

Peer comment payloads are encrypted before they are sent in `comment:add`. The DO stores the encrypted payload string directly and does not inspect comment content.

## 7. Core Flows

### Share creation

1. Host generates share key and `hostSecret`.
2. Host uploads encrypted content to `POST /share/:docId`.
3. Worker stores share content + metadata in KV.
4. Host subscribes to `/relay` as `role: "host"` with `hostSecret`.

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
5. Host replaces pending comments for that share with the snapshot, filtered against locally queued resolves.

### Host merge / dismiss

1. Host merges or dismisses a peer comment in the review UI.
2. Host removes it from current pending UI state.
3. Host queues the resolve locally and flushes `comment:resolve`.
4. DO deletes the comment row from SQLite.
5. DO sends `comment:resolve:ack` to the host.
6. DO broadcasts `comment:resolved` to subscribers.
7. Peers remove the matching submitted comment from their local view.

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

## 9. Limitations

- The relay comment store tracks unresolved peer comments only.
- Peer mode does not render other peers' comments as a collaborative thread.
- Real-time edit/delete of submitted peer comments is out of scope.
- A single relay hub is sufficient for the current scale but not intended for large fan-out.
- `document:updated` is a live notification, not a durable event log. Share content itself remains durable in KV.
- Peer comment submission depends on relay connectivity. Unsynced peer drafts stay local until relay subscribe succeeds.

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
