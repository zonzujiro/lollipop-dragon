# MarkReview v2 — Peer Sharing & Async Collaboration

## 1. Overview

MarkReview v2 adds the ability to share documents with 2–5 remote peers for review and commenting. The architecture uses a single Cloudflare Worker + KV as an encrypted blob store for both content delivery and comment collection. All content is encrypted client-side before leaving the browser. Peers need nothing but a browser and a link.

---

## 2. Context

MarkReview v1 is deployed on GitHub Pages as a static app. It supports local folder navigation, rich markdown rendering (Mermaid, KaTeX, code blocks, tables), and block-level commenting via CriticMarkup. The LLM feedback loop works — comments are written inline as CriticMarkup, the LLM reads and addresses them, and the editor reflects changes.

v1 is single-user. This release adds peer sharing.

---

## 3. Constraints

- File content is private and must not be publicly readable on any server.
- The app is a static site on GitHub Pages — no backend beyond the Cloudflare Worker.
- Peers should not need to install any software, create accounts, or authenticate. Browser only.
- Target group size: 2–5 people.
- Host is a developer. Peers may or may not be developers.
- Outdated shared documents should be purged automatically.

---

## 4. Architecture

### 4.1 Design

```
┌─────────────────────────────────────────────────┐
│            Cloudflare Worker + KV                │
│        (async encrypted blob storage)            │
│                                                  │
│  Content:                                        │
│  - Host encrypts files client-side (AES-256)     │
│  - Uploads encrypted blob → Worker stores in KV  │
│  - Peers fetch blob, decrypt in browser          │
│  - Works anytime, host doesn't need to be online │
│                                                  │
│  Comments:                                       │
│  - Peers encrypt comments client-side            │
│  - POST to Worker → stored in KV                 │
│  - Host fetches and merges into local files      │
│  - No auth needed from peers                     │
│                                                  │
│  Auto-purge via KV TTL (default 7 days)          │
└─────────────────────────────────────────────────┘
```

The entire sharing flow is async. Host uploads, peers read and comment on their own time, host checks comments when ready. No one needs to be online simultaneously.

### 4.2 Cloudflare Worker API

A single Cloudflare Worker (~30 lines) backed by one KV namespace. Six endpoints:

```
POST   /share                 ← host uploads encrypted content blob → returns doc-id
GET    /share/{doc-id}        ← anyone fetches encrypted content (no auth)
DELETE /share/{doc-id}        ← host deletes content (requires host-secret header)

POST   /comments/{doc-id}    ← anyone posts encrypted comment blob (no auth)
GET    /comments/{doc-id}    ← anyone fetches all pending comments (no auth)
DELETE /comments/{doc-id}    ← host clears comments (requires host-secret header)
```

- All blobs are opaque encrypted binary. The Worker never sees plaintext.
- `doc-id` is a random UUID generated client-side.
- `host-secret` is a random token generated at share time, stored only in the host's browser. Used for delete operations.
- KV TTL handles auto-expiry. Default: 7 days. Configurable per share.
- No authentication, no accounts, no user data stored.

### 4.3 Shareable Link Structure

```
https://host.github.io/markreview/#doc=docId&key=encKey
```

- `doc` — document ID for fetching content from the Worker
- `key` — AES-256 decryption key

The URL fragment (`#`) is never sent in HTTP requests. GitHub Pages, Cloudflare, and any intermediary never see the key.

---

## 5. Encryption Scheme

### 5.1 Content Encryption

- Algorithm: AES-256-GCM via Web Crypto API.
- Key generation: `crypto.getRandomValues()` produces a 256-bit key.
- The key is Base64url-encoded and placed in the URL fragment.
- Before upload: all files in the shared folder are serialized into a single JSON structure, compressed (gzip), and encrypted.
- The encrypted blob is stored in Cloudflare KV.
- Cloudflare sees only encrypted binary. Without the key, content is unrecoverable.

### 5.2 Comment Encryption

- Comments are encrypted with the same AES-256-GCM key as the content.
- Peers have the key from the URL fragment.
- Each comment is a separate encrypted blob stored under the doc-id.
- Cloudflare cannot read comment content.

---

## 6. Data Format

### 6.1 Shared Content Structure

The encrypted blob, once decrypted, contains:

```json
{
  "version": "2.0",
  "created_at": "2026-02-26T10:00:00Z",
  "tree": {
    "overview.md": "# Overview\n\nThis research covers...",
    "database/comparison.md": "{==PostgreSQL is the best choice.==}{>>fix: Add MySQL and SQLite comparison.<<}\n...",
    "database/benchmarks.md": "# Benchmarks\n\n| DB | Read | Write |\n..."
  }
}
```

- `tree` preserves the full folder structure using path keys.
- CriticMarkup comments are embedded in the file content as per v1.

### 6.2 Comment Structure

Each comment posted to the Worker is an encrypted blob. Once decrypted:

```json
{
  "id": "c_01",
  "peer_name": "Alex",
  "path": "database/comparison.md",
  "block_ref": {
    "type": "paragraph",
    "content_preview": "PostgreSQL is the best choice.",
    "line_start": 14,
    "line_end": 14
  },
  "comment_type": "fix",
  "text": "This claim needs evidence. Compare PostgreSQL, MySQL, and SQLite.",
  "created_at": "2026-02-26T14:30:00Z"
}
```

The host's app converts this into CriticMarkup and inserts it into the local file:

```
{==PostgreSQL is the best choice.==}{>>fix: This claim needs evidence. Compare PostgreSQL, MySQL, and SQLite. — Alex<<}
```

---

## 7. Features

### 7.1 Share Documents

The host selects files or folders to share and clicks "Share." The app encrypts the content, uploads to the Worker, generates a link with the key in the fragment, and copies it to clipboard. The host sends the link to peers via any channel (Slack, Telegram, email).

**Host requirements:** None beyond initial Cloudflare Worker deployment (one-time ~10 minute setup).

**Peer requirements:** None. A browser and the link.

### 7.2 View Shared Documents

Peers open the link. The app fetches the encrypted blob from the Worker, decrypts it in the browser, reconstructs the folder tree, and renders the documents in the same clean reading UI as v1. File tree sidebar, rich rendering, CriticMarkup comments displayed as margin elements — identical experience to the host.

### 7.3 Async Commenting

Peers can comment on any block, just like in v1. The app encrypts the comment and POSTs it to the Worker's comment endpoint. No auth, no account needed.

Next time the host opens the app, it fetches pending comments from the Worker, decrypts them, and offers to merge them into the local files as CriticMarkup. The host can accept or dismiss each comment.

Peers can always comment, regardless of whether the host is online.

### 7.4 Manage Shared Documents

The host has a "Shared" panel showing all active shares:

- Document/folder name, creation date, expiry (TTL).
- "Revoke" button — deletes the content and comments from the Worker immediately.
- "Update" button — re-encrypts current file state and uploads to the Worker, replacing the old blob. Same link keeps working, peers see the updated content.
- "Check comments" button — fetches and displays pending async comments from the Worker.
- Share metadata (doc-id, host-secret) is stored in the host's browser localStorage.

---

## 8. User Flows

### 8.1 Host Shares a Document

1. Host opens folder in MarkReview, navigates to a file or folder.
2. Host clicks "Share" (top bar button).
3. App prompts: share this file or the entire folder. Optional: set expiry (default 7 days).
4. App encrypts content, uploads to Worker, generates link.
5. Link is copied to clipboard. Toast: "Link copied. Share it with your reviewers."
6. Host sends link via Slack/Telegram/email.

### 8.2 Peer Reviews and Comments

1. Peer opens link in browser. App prompts for their display name.
2. App fetches encrypted blob from Worker, decrypts, renders.
3. Peer reads the document in the clean rendered view.
4. Peer hovers over a block, clicks comment icon, selects type, writes comment.
5. Comment is encrypted and POSTed to the Worker.
6. Peer sees confirmation: "Comment saved."

### 8.3 Host Receives Feedback

1. Host opens MarkReview. App checks Worker for pending comments on all active shares.
2. Badge appears on Shared panel: "3 new comments."
3. Host clicks to review. Comments are decrypted and shown with peer name, file path, and block reference.
4. Host clicks "Merge" — app inserts CriticMarkup into the local files.
5. Host tells LLM CLI: "Address the comments in this file."
6. LLM reads CriticMarkup, makes fixes, removes the markup.
7. Host clicks "Update" to push revised content to Worker. Peers see updates on next load.

---

## 9. Cloudflare Worker Specification

### 9.1 Infrastructure

- One Cloudflare Worker (free tier: 100K requests/day).
- One KV namespace (free tier: 10GB storage, 100K reads/day, 1K writes/day).
- Deployed once via `wrangler deploy`. No ongoing maintenance.

### 9.2 KV Key Schema

```
share:{doc-id}                    → encrypted content blob (TTL: 7 days default)
share:{doc-id}:meta               → { host_secret_hash, created_at, ttl } (plaintext metadata)
comments:{doc-id}:{comment-id}    → encrypted comment blob (TTL: 7 days)
```

### 9.3 Security

- `host-secret` is generated client-side at share time and hashed (SHA-256) before storing in KV metadata.
- DELETE operations require the raw `host-secret` in a header. The Worker hashes it and compares.
- No other authentication exists. Content security relies entirely on client-side encryption.
- The Worker never decrypts anything. It is a dumb blob store.

### 9.4 Rate Limiting

- The Worker should enforce basic rate limiting to prevent abuse: max 100 writes per IP per hour, max 10MB per blob.
- Cloudflare's free tier limits provide a natural ceiling.

### 9.5 CORS

- The Worker must return appropriate CORS headers to allow requests from the GitHub Pages domain.

---

## 10. Technical Stack

- **Encryption:** Web Crypto API (AES-256-GCM, native browser implementation)
- **Async storage:** Cloudflare Worker + KV (encrypted blob store)
- **Hosting:** GitHub Pages (static site)

---

## 11. Security Model

| Layer                 | What's protected               | How                                   |
| --------------------- | ------------------------------ | ------------------------------------- |
| Content at rest (KV)  | File content                   | AES-256-GCM, key in URL fragment only |
| Comments at rest (KV) | Peer comments                  | AES-256-GCM, same key                 |
| Content in transit    | Worker requests                | TLS (Cloudflare)                      |
| Cloudflare Worker/KV  | Cannot read anything           | Only stores encrypted blobs           |
| Delete operations     | Prevents unauthorized deletion | host-secret header, hashed in KV      |

**What an attacker would need to compromise content:** The full URL including the fragment. The fragment is never logged by any server, never appears in HTTP requests, and is only shared directly between host and peers.

---

## 12. Purge & Lifecycle

- Every blob in KV has a TTL (default 7 days, configurable at share time).
- KV auto-deletes expired blobs. No cron jobs, no manual cleanup.
- Host can manually revoke any share via the "Revoke" button, which calls DELETE on the Worker.
- After deletion, peers with the link see: "This document is no longer available."
- No data persists anywhere after purge. Cloudflare deletes the encrypted blobs. The decryption key only existed in the URL and the host's browser.

---

## 13. Storage Layer Abstraction

The app abstracts all storage behind a simple interface:

```typescript
interface ShareStorage {
  uploadContent(
    blob: ArrayBuffer,
  ): Promise<{ docId: string; hostSecret: string }>;
  fetchContent(docId: string): Promise<ArrayBuffer>;
  deleteContent(docId: string, hostSecret: string): Promise<void>;
  postComment(docId: string, blob: ArrayBuffer): Promise<string>;
  fetchComments(docId: string): Promise<ArrayBuffer[]>;
  deleteComments(docId: string, hostSecret: string): Promise<void>;
}
```

If the storage backend needs to change in the future, only the implementation of this interface changes. The rest of the app is unaffected.

---

## 14. Limitations & Tradeoffs

- **Cloudflare account required from host.** One-time setup (~10 minutes). Peers need nothing.
- **Worker is a single point of failure for sharing.** If Cloudflare is down, sharing doesn't work. Local editing is unaffected.
- **Blob size limit.** KV values max out at 25MB. Sufficient for hundreds of markdown files. If exceeded, the app splits across multiple KV entries.
- **Free tier limits.** 100K requests/day and 1K writes/day. More than enough for 2–5 peers. If exceeded, Cloudflare's paid tier is $5/month.
- **No real-time sync.** Comments are async. Host must manually check for new comments. Acceptable for the review workflow. Real-time sync is planned for v3.
- **No persistent identity.** Peers self-declare their name. No accounts. For 2–5 trusted peers this is acceptable.

---

## 15. Implementation Phases

### Phase 2a — Cloudflare Worker + Encrypted Sharing

- Deploy the Cloudflare Worker with KV namespace.
- "Share" button: encrypt content, upload to Worker, generate link.
- Peer view: fetch, decrypt, render with full v1 reading experience.
- Shared panel for host to manage, update, and revoke shares.
- Auto-purge via KV TTL.

### Phase 2b — Async Commenting

- Peers can post encrypted comments to the Worker.
- Host can fetch, decrypt, review, and merge comments into local files.
- Comment merge inserts CriticMarkup into the appropriate file locations.
- "Check comments" workflow in the Shared panel.
- Notification badge for pending comments.

---

## 16. Future (v3) — Real-Time Collaboration

If the async workflow proves insufficient, v3 adds real-time sync:

- WebRTC via Trystero for peer discovery and direct browser-to-browser connections.
- Yjs + y-webrtc-trystero for CRDT-based conflict-free comment sync.
- Signaling via public Nostr relays (no server infrastructure).
- Peer presence indicators (who's online, what they're viewing).
- NAT traversal via STUN/TURN for connectivity across different networks.
- All data encrypted end-to-end via DTLS.

This is additive — the Cloudflare Worker remains as the async fallback layer.

---

## 17. Success Metrics

- Host can share a document and have a peer viewing it within 30 seconds.
- Encrypted content is unreadable without the URL fragment key.
- Peers can leave comments without any authentication or setup.
- Host can merge peer comments into local files in under 1 minute.
- Expired shares are purged automatically with zero manual intervention.
- Cloudflare Worker deployment takes under 10 minutes for the host.
