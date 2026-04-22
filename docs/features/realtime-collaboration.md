# MarkReview v3 — Real-Time Collaboration

## 1. Overview

MarkReview v3 adds real-time collaboration on top of the async sharing from v2. When the host and peers have the same document open, comments sync bidirectionally in real time via WebRTC. Peer presence is visible — who's online and what they're viewing. The Cloudflare Worker from v2 remains as the async fallback for when peers aren't online simultaneously.

---

## 2. Context

MarkReview v2 delivers async sharing via a Cloudflare Worker. Host encrypts and uploads content, peers read and comment on their own time, host merges comments later. This works well for most review cycles.

v3 addresses the cases where async isn't enough: live review sessions where the host walks peers through a document, rapid back-and-forth feedback, and situations where the host wants to see comments appear as they're written rather than checking later.

---

## 3. When v3 Matters

v3 is valuable when:

- Host and peer are on a call reviewing a document together.
- Multiple peers are reviewing simultaneously and the host wants to monitor progress.
- Feedback is time-sensitive and the host wants to address comments immediately.
- The host wants to push a revised version and see peers react in real time.

v3 is not needed when:

- The host shares a link and peers review on their own schedule.
- Peers are in different time zones and async is natural.
- The review cycle is measured in hours or days, not minutes.

---

## 4. Architecture

### 4.1 Layered Design

```
┌─────────────────────────────────────────────────┐
│  Layer 1: Cloudflare Worker + KV (from v2)       │
│  - Async content delivery and comment storage    │
│  - Always available, no one needs to be online   │
│  - Unchanged from v2                             │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Layer 2: WebRTC via Trystero + Yjs (new in v3)  │
│  - Real-time comment sync when both online       │
│  - Peer presence and awareness                   │
│  - Signaling via public Nostr relays             │
│  - End-to-end encrypted (DTLS)                   │
│  - Graceful fallback to Layer 1 when offline     │
└─────────────────────────────────────────────────┘
```

Layer 1 is the foundation. Layer 2 is an enhancement that activates automatically when multiple peers are online. If WebRTC fails or a peer goes offline, the app falls back to Layer 1 seamlessly.

### 4.2 Connection Flow

1. Peer opens a shared link.
2. App fetches and decrypts content from the Worker (Layer 1, same as v2).
3. App attempts to join a Trystero room derived from the doc-id.
4. If the host (or other peers) are in the same room, WebRTC connection is established.
5. Yjs syncs the comment state between all connected peers.
6. If no one else is in the room, the app continues in async mode (v2 behavior).

The peer experience is identical whether or not WebRTC connects. The only visible difference is a presence indicator showing who's online.

### 4.3 Signaling (Trystero)

Trystero uses public Nostr relays for peer discovery. The relay only facilitates the initial WebRTC handshake — it sees the room ID and encrypted signaling metadata. Once the direct connection is established, the relay is no longer involved.

Room privacy is enforced by a password. The shareable link gains two new fragment parameters:

```
https://host.github.io/markreview/#doc=docId&key=encKey&room=roomId&pwd=roomPwd
```

- `room` — Trystero room ID (derived from doc-id)
- `pwd` — room password preventing uninvited peers from joining

Both are in the URL fragment and never sent to any server.

### 4.4 NAT Traversal

WebRTC uses ICE to find the best connection path:

**Direct (STUN):** Both browsers discover their public IPs via free STUN servers (e.g., Google's). NAT hole-punching establishes a direct UDP connection. Works ~85% of the time on home and office networks.

**Relayed (TURN):** When direct fails (symmetric NAT, corporate firewalls, some mobile networks with CGNAT), traffic routes through a TURN relay server. Data remains end-to-end encrypted via DTLS — the relay forwards packets it cannot read. Adds latency but is still fast for text payloads.

For MarkReview's use case (small JSON messages and markdown text, not video or audio), even relayed connections feel instant. A free or low-cost TURN fallback should be configured for reliability.

### 4.5 Real-Time Sync (Yjs)

Yjs is a CRDT (Conflict-free Replicated Data Type) library. Combined with y-webrtc-trystero, it provides:

- Automatic conflict resolution when two peers comment on the same block simultaneously.
- Offline tolerance — if a peer briefly disconnects, changes merge cleanly on reconnect.
- Awareness protocol — each peer broadcasts their name, cursor position, and active file.

The Yjs document models the shared comment state. The host's app maps Yjs state changes back to CriticMarkup in the local files.

---

## 5. Sync Model

### 5.1 What Syncs

Comments are the only synced data. File content is read-only for peers (delivered via the Worker). The host is the sole owner of file content.

The Yjs shared document contains:

```
Y.Map("comments") → {
  "c_01": { path, block_ref, comment_type, text, peer_name, created_at },
  "c_02": { ... },
  ...
}
```

When a peer adds a comment, it's inserted into the Y.Map. Yjs propagates the change to all connected peers. The host's app watches for changes and writes CriticMarkup into the local file.

When the host removes CriticMarkup (because the LLM addressed it), the host's app removes the corresponding entry from the Y.Map, and peers see the comment disappear.

### 5.2 What Doesn't Sync

- File content. Peers read the version from the Worker. If the host updates the shared content (clicks "Update"), peers refresh to see the new version.
- File tree structure. Static, delivered via the Worker.
- Editor state (scroll position, selected block). Only the awareness cursor position is shared.

### 5.3 Conflict Resolution

Yjs CRDTs handle concurrent edits automatically. If two peers add a comment on the same block at the same time, both comments are preserved. There are no conflicts to resolve manually for additions.

For deletions: only the host can remove comments (by addressing them and removing CriticMarkup). Peers cannot delete each other's comments. This avoids deletion conflicts entirely.

### 5.4 Sync + Async Interplay

Comments can arrive through two channels: WebRTC (real-time) and the Worker (async). The app must reconcile both:

- When WebRTC is active, comments sync in real time. The app also writes them to the Worker as a backup.
- When WebRTC is not active, comments go to the Worker only.
- When the host fetches comments from the Worker, it deduplicates against comments already received via WebRTC using the comment ID.

This ensures no comments are lost regardless of the connectivity path.

---

## 6. Features

### 6.1 Automatic Connection

When a peer opens a shared link and the host is online with MarkReview open, WebRTC connects automatically. No button to click, no "start session" action. The app tries to join the Trystero room on every shared document load. If it connects, great — real-time mode activates. If not, async mode continues as in v2.

### 6.2 Peer Presence

When connected via WebRTC, the UI shows:

- A presence bar in the top area showing connected peers as colored initials or small avatars.
- Each peer's name (self-declared on first open).
- An indicator of which file each peer is currently viewing.
- In the document margin, a subtle colored cursor showing which block a peer is focused on.

Presence data is managed by Yjs awareness protocol. It's ephemeral — when a peer disconnects, their presence disappears immediately.

### 6.3 Real-Time Comments

When WebRTC is active, peer comments appear in the host's margin within 1 second. The host sees a brief highlight animation when a new comment arrives. The comment includes the peer's name and is immediately written as CriticMarkup into the local file. The host can address it right away or let it accumulate.

### 6.4 Live Content Updates

When the host clicks "Update" to push revised content to the Worker, connected peers receive a notification: "Document has been updated. Reload to see changes." Clicking reloads the content from the Worker. Previously resolved comments (removed by the LLM) disappear from the peer's view.

Obsolete note:

- The strictly manual reload-on-notification flow above is obsolete.
- Canonical behavior now uses safe auto-update:
  - auto-refresh immediately when the peer has no local comment work in progress
  - block on refresh when the peer has local unsent comments or an open draft comment form
  - discard unsent peer comments that belonged to the older snapshot when the peer refreshes from that stale state

### 6.5 Connection Status Indicator

A small status indicator in the UI shows the current state:

- **Green dot** — "Connected to N peers" (WebRTC active)
- **Yellow dot** — "Connecting..." (signaling in progress)
- **Gray dot** — "Offline mode — comments will be saved to server" (async fallback)

The transition between states is automatic and seamless.

### 6.6 Graceful Degradation

If WebRTC disconnects mid-session (network switch, laptop sleep, mobile tower change):

- The app attempts to reconnect automatically.
- Any comments made during disconnection are queued locally.
- On reconnect, Yjs merges the queued changes.
- If reconnection fails after 30 seconds, the app switches to async mode and POSTs queued comments to the Worker.
- The user sees: "Connection lost. Comments will be saved to server."

---

## 7. User Flows

### 7.1 Live Review Session

1. Host opens MarkReview with local files, navigates to a shared document.
2. Host sends the link to peers: "Let's review this together."
3. Peer opens the link. App loads content from Worker, then connects via WebRTC.
4. Both see each other in the presence bar.
5. Host says (on Slack/call): "Look at the database comparison section."
6. Peer navigates there. Host sees peer's cursor move to that section.
7. Peer leaves a comment: "fix: Missing SQLite data."
8. Comment appears in host's margin instantly. Host's file is updated with CriticMarkup.
9. Host tells LLM: "Address the comments in database/comparison.md."
10. LLM fixes the file. Host clicks "Update."
11. Peer sees notification, reloads, reviews the changes.

### 7.2 Peer Comments While Host Goes Offline

1. Host and peer are in a live session.
2. Host closes laptop. WebRTC disconnects.
3. Peer continues reading and commenting.
4. App detects disconnection, switches to async mode.
5. Peer's comments are encrypted and POSTed to the Worker.
6. Next time host opens the app, pending comments are fetched and merged.

### 7.3 Mixed Async and Real-Time

1. Peer A reviews the document at 10am (host offline). Comments saved to Worker.
2. Host opens MarkReview at 2pm. Fetches Peer A's comments, merges them.
3. Peer B opens the link at 2:15pm. WebRTC connects to host.
4. Peer B comments in real time. Host sees them instantly.
5. Both Peer A's async comments and Peer B's real-time comments end up as CriticMarkup in the same files.

---

## 8. Technical Stack (v3 Additions)

- **Signaling:** Trystero (Nostr strategy default, BitTorrent fallback)
- **Real-time sync:** Yjs + y-webrtc-trystero
- **NAT traversal:** Google STUN servers (free), configurable TURN fallback
- **Awareness:** Yjs awareness protocol (presence, cursors)

Everything from v2 remains unchanged: Web Crypto API for encryption, Cloudflare Worker + KV for async storage, GitHub Pages for hosting.

---

## 9. Security Model (v3 Additions)

| Layer                   | What's protected       | How                                   |
| ----------------------- | ---------------------- | ------------------------------------- |
| WebRTC data channel     | Real-time comment sync | DTLS (built into WebRTC, automatic)   |
| Signaling (Nostr relay) | Connection metadata    | Room password encryption via Trystero |
| Nostr relays            | Cannot read signaling  | Encrypted with room password          |
| TURN relay (if used)    | Cannot read data       | Forwards encrypted DTLS packets       |

The Nostr relays only see the room ID and encrypted SDP signaling messages. They never see file content, comments, or the encryption key. Once WebRTC is established, the relay is no longer involved. All data flows directly between browsers, encrypted with DTLS.

The room password (in the URL fragment) prevents uninvited peers from joining even if they discover the room ID.

---

## 10. TURN Relay Strategy

Most connections will succeed via STUN (direct). For the ~15% that don't (corporate networks, mobile CGNAT, symmetric NAT), a TURN relay is needed.

Options for TURN:

- **Cloudflare Calls TURN** — If available, keeps infrastructure within Cloudflare.
- **Twilio TURN** — ~$0.40/GB. For text-only sync, monthly cost would be cents.
- **Self-hosted Coturn** — Free, runs on a $3–5/month VPS.
- **Metered.ca** — Free tier includes 500MB/month TURN relay.

For MarkReview's text payloads, even the cheapest option is more than sufficient. The app should be configurable to use any TURN provider via the settings.

---

## 11. Limitations & Tradeoffs

- **Both parties must be online for real-time sync.** This is additive to v2 async, not a replacement. If no one else is online, the app works exactly as v2.
- **Trystero depends on public Nostr relays.** These are generally reliable but not guaranteed. Trystero connects to multiple relays for redundancy. If all relays fail, the app falls back to async.
- **NAT traversal is not 100% reliable.** ~85% success on home/office, ~70–80% on mobile. TURN fallback covers the rest but requires configuration.
- **No persistent rooms.** The room exists only while at least one peer is connected. There's no state on the relay between sessions.
- **Browser tab must stay open.** WebRTC runs in the browser tab. Closing the tab or sleeping the laptop disconnects.
- **Mobile network instability.** CGNAT and cell tower switches cause brief disconnections. Auto-reconnect and Yjs state reconciliation handle this, but peers may see momentary "reconnecting" states.
- **Additional complexity.** Trystero, Yjs, y-webrtc-trystero, STUN/TURN configuration, presence UI, and fallback logic add significant implementation effort compared to v2.

---

## 12. Implementation Phases

### Phase 3a — WebRTC Connection

- Trystero integration: join room on shared document load.
- Room password from URL fragment.
- Connection status indicator (green/yellow/gray).
- Auto-reconnection on disconnect.
- Fallback to async (v2) when WebRTC unavailable.

### Phase 3b — Real-Time Comment Sync

- Yjs + y-webrtc-trystero integration.
- Shared Y.Map for comment state.
- Peer comments appear in host's margin in real time.
- Host's app writes incoming comments as CriticMarkup to local files.
- Comment removal syncs when host addresses CriticMarkup.
- Deduplication between WebRTC and Worker comment channels.

### Phase 3c — Presence

- Peer names and status in the presence bar.
- Active file indicator per peer.
- Block-level cursor position in the document margin.
- Yjs awareness protocol integration.

### Phase 3d — Polish

- "Document updated" notification for connected peers when host pushes new content.
- Graceful degradation: queue comments locally during disconnection, sync or POST to Worker on reconnect/timeout.
- TURN configuration in app settings.
- Mobile-responsive presence UI.

---

## 13. Success Metrics

- WebRTC connection establishes within 5 seconds when both parties are online.
- Real-time comments appear on the host's side within 1 second.
- Connection succeeds on first attempt for >80% of peer pairs.
- Fallback to async mode is seamless — no user action required, no comments lost.
- Presence accurately reflects who is online and what they're viewing.
- A peer who disconnects and reconnects loses no comment data.
- The v2 async workflow continues to work identically whether or not v3 WebRTC is active.
