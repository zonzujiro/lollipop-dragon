# MarkReview v2 — Technical Design: Peer Sharing & Async Collaboration

## 1. Version Scope

v2 adds encrypted async peer sharing on top of the v1 local editing experience. A single Cloudflare Worker + KV namespace acts as a dumb encrypted blob store. The host encrypts content client-side and uploads it; peers fetch and decrypt entirely in the browser. Peers post encrypted comments; the host merges them into local CriticMarkup files. No accounts, no installs for peers, no plaintext on any server.

### What's in v2

- **Phase 2a — Sharing:** Host encrypts + uploads content; peers fetch, decrypt, and render with full v1 reading experience; host manages active shares (revoke, update, expiry)
- **Phase 2b — Async commenting:** Peers post encrypted comments; host fetches, reviews, and merges them into local files as CriticMarkup

### What's NOT in v2

- Real-time sync (planned for v3 via WebRTC + Yjs)
- Peer identity / authentication (peers self-declare a display name)
- Comment threads or reactions
- Diff view between share revisions

---

## 2. Tech Stack Additions

| Layer             | Choice                         | Why                                                                    |
| ----------------- | ------------------------------ | ---------------------------------------------------------------------- |
| Encryption        | Web Crypto API (AES-256-GCM)   | Native browser, no dependencies, zero plaintext leaves the browser     |
| Compression       | Compression Streams API (gzip) | Native browser, reduces blob size before encryption                    |
| Storage backend   | Cloudflare Worker + KV         | Free tier covers 2–5 peers; ~30 lines of Worker code; zero maintenance |
| Worker deployment | Wrangler CLI                   | Official Cloudflare tooling; one-time `wrangler deploy`                |
| Share metadata    | localStorage                   | Host-only; stores doc-id, host-secret, expiry, file/folder name        |

---

## 3. Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         Host Browser                           │
│                                                                │
│  ┌──────────────────┐    ┌─────────────────────────────────┐  │
│  │  MarkReview App  │    │       ShareService               │  │
│  │  (v1 unchanged)  │    │  encrypt() / decrypt()          │  │
│  │                  │───▶│  compress() / decompress()      │  │
│  │  + Share icons   │    │  upload() / download()          │  │
│  │  + Shared panel  │    │  postComment() / fetchComments() │  │
│  │  + Merge UI      │    └──────────────┬──────────────────┘  │
│  └──────────────────┘                   │ HTTPS                │
└─────────────────────────────────────────┼──────────────────────┘
                                          │
                             ┌────────────▼────────────┐
                             │   Cloudflare Worker      │
                             │   (dumb blob store)      │
                             │                          │
                             │   POST /share            │
                             │   GET  /share/{id}       │
                             │   DELETE /share/{id}     │
                             │   POST /comments/{id}    │
                             │   GET  /comments/{id}    │
                             │   DELETE /comments/{id}  │
                             └────────────┬─────────────┘
                                          │
                             ┌────────────▼────────────┐
                             │   Cloudflare KV           │
                             │   (encrypted blobs only)  │
                             │   TTL auto-purge          │
                             └────────────┬─────────────┘
                                          │
                             ┌────────────▼────────────┐
                             │       Peer Browser        │
                             │                          │
                             │  Open link → decrypt →   │
                             │  render (full v1 UI)  →  │
                             │  post encrypted comment  │
                             └──────────────────────────┘
```

---

## 4. Encryption Scheme

### 4.1 Key generation

```typescript
const key = await crypto.subtle.generateKey(
  { name: "AES-GCM", length: 256 },
  true, // extractable for URL encoding
  ["encrypt", "decrypt"],
);
const rawKey = await crypto.subtle.exportKey("raw", key);
const keyB64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)))
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, ""); // base64url
```

The key lives only in the URL fragment (`#key=<base64url>`) and the host's browser memory. It is never sent to any server.

### 4.2 Encrypt / Decrypt

```typescript
async function encrypt(
  plaintext: Uint8Array,
  key: CryptoKey,
): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );
  // Prepend 12-byte IV to ciphertext for transport
  const result = new Uint8Array(12 + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), 12);
  return result.buffer;
}

async function decrypt(blob: ArrayBuffer, key: CryptoKey): Promise<Uint8Array> {
  const iv = new Uint8Array(blob, 0, 12);
  const ciphertext = new Uint8Array(blob, 12);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new Uint8Array(plaintext);
}
```

### 4.3 Content serialization

Before encryption, all files are serialized into a single JSON structure, then gzip-compressed:

```typescript
interface SharePayload {
  version: "2.0";
  created_at: string; // ISO 8601
  tree: Record<string, string>; // { 'path/file.md': 'raw markdown content' }
}

async function serializeFolder(
  tree: Record<string, string>,
): Promise<Uint8Array> {
  const json = JSON.stringify({
    version: "2.0",
    created_at: new Date().toISOString(),
    tree,
  });
  const stream = new Blob([json])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deserializeFolder(
  compressed: Uint8Array,
): Promise<SharePayload> {
  const stream = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const json = await new Response(stream).text();
  return JSON.parse(json);
}
```

---

## 5. Cloudflare Worker

### 5.1 KV key schema

```
share:{doc-id}              → encrypted content blob         (TTL: configurable, default 7 days)
share:{doc-id}:meta         → { hostSecretHash, createdAt, ttl, label }  (plaintext, no TTL)
comments:{doc-id}:{cmt-id}  → encrypted comment blob         (TTL: same as share)
```

### 5.2 Worker source (~60 lines)

```typescript
// worker.ts
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const [, resource, docId, sub] = url.pathname.split("/");

    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Host-Secret",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    // --- /share ---
    if (resource === "share" && !sub) {
      if (req.method === "POST") {
        const docId = crypto.randomUUID();
        const blob = await req.arrayBuffer();
        if (blob.byteLength > 25 * 1024 * 1024)
          return err(413, "Blob too large", cors);
        const ttl = Number(url.searchParams.get("ttl") ?? 604800);
        const hostSecret = req.headers.get("X-Host-Secret") ?? "";
        const hostSecretHash = await sha256(hostSecret);
        await env.KV.put(`share:${docId}`, blob, { expirationTtl: ttl });
        await env.KV.put(
          `share:${docId}:meta`,
          JSON.stringify({
            hostSecretHash,
            createdAt: new Date().toISOString(),
            ttl,
            label: url.searchParams.get("label") ?? "",
          }),
        );
        return json({ docId }, cors);
      }
      if (req.method === "GET" && docId) {
        const blob = await env.KV.get(`share:${docId}`, "arrayBuffer");
        if (!blob) return err(404, "Not found", cors);
        return new Response(blob, {
          headers: { ...cors, "Content-Type": "application/octet-stream" },
        });
      }
      if (req.method === "DELETE" && docId) {
        if (!(await verifySecret(req, env, `share:${docId}:meta`)))
          return err(403, "Forbidden", cors);
        await env.KV.delete(`share:${docId}`);
        await env.KV.delete(`share:${docId}:meta`);
        return json({ ok: true }, cors);
      }
    }

    // --- /comments ---
    if (resource === "comments" && docId) {
      if (req.method === "POST") {
        const blob = await req.arrayBuffer();
        const cmtId = crypto.randomUUID();
        const meta = await getMeta(env, docId);
        if (!meta) return err(404, "Share not found", cors);
        await env.KV.put(`comments:${docId}:${cmtId}`, blob, {
          expirationTtl: meta.ttl,
        });
        return json({ cmtId }, cors);
      }
      if (req.method === "GET") {
        const list = await env.KV.list({ prefix: `comments:${docId}:` });
        const blobs = await Promise.all(
          list.keys.map((k) => env.KV.get(k.name, "arrayBuffer")),
        );
        // Return as newline-delimited base64 blobs
        const body = blobs
          .filter(Boolean)
          .map((b) => btoa(String.fromCharCode(...new Uint8Array(b!))))
          .join("\n");
        return new Response(body, {
          headers: { ...cors, "Content-Type": "text/plain" },
        });
      }
      if (req.method === "DELETE") {
        if (!(await verifySecret(req, env, `share:${docId}:meta`)))
          return err(403, "Forbidden", cors);
        const list = await env.KV.list({ prefix: `comments:${docId}:` });
        await Promise.all(list.keys.map((k) => env.KV.delete(k.name)));
        return json({ ok: true }, cors);
      }
    }

    return err(404, "Not found", cors);
  },
};
```

### 5.3 Security

- `host-secret` is a random 32-byte hex string generated client-side at share time
- Stored in KV only as `SHA-256(host-secret)` — Worker cannot recover the original
- DELETE requires the raw secret in `X-Host-Secret` header; Worker hashes and compares
- Content is always opaque binary — Worker never interprets or logs plaintext
- Rate limiting: 100 writes per IP per hour via Cloudflare's built-in rate limiting rules

---

## 6. ShareStorage Interface

All sharing logic is behind this interface. If the backend changes, only the implementation changes.

```typescript
interface ShareStorage {
  uploadContent(
    blob: ArrayBuffer,
    opts: { ttl: number; label: string },
  ): Promise<{ docId: string; hostSecret: string }>;

  fetchContent(docId: string): Promise<ArrayBuffer>;

  deleteContent(docId: string, hostSecret: string): Promise<void>;

  postComment(docId: string, blob: ArrayBuffer): Promise<string>; // returns cmtId

  fetchComments(docId: string): Promise<ArrayBuffer[]>;

  deleteComments(docId: string, hostSecret: string): Promise<void>;
}
```

Implementation: `src/services/shareStorage.ts` (Cloudflare Worker backend).

---

## 7. Shareable Link Structure

```
https://zonzujiro.github.io/lollipop-dragon/#share=<docId>&key=<base64url-key>
```

- Fragment (`#`) is never sent in HTTP requests — key never reaches GitHub Pages or Cloudflare
- Peer mode is detected on app load by checking `location.hash` for `share=` parameter
- In peer mode, the full v1 reading UI renders but write operations are disabled

---

## 8. Data Formats

### 8.1 Comment blob (decrypted)

```typescript
interface PeerComment {
  id: string; // 'c_<uuid>'
  peerName: string; // self-declared display name
  path: string; // 'database/comparison.md'
  blockRef: {
    blockIndex: number;
    contentPreview: string; // first 80 chars of block text
  };
  commentType: CommentType;
  text: string;
  createdAt: string; // ISO 8601
}
```

### 8.2 Share metadata (localStorage, host only)

```typescript
interface ShareRecord {
  docId: string;
  hostSecret: string;
  label: string; // human-readable file or folder name (display only)
  createdAt: string;
  expiresAt: string;
  pendingCommentCount: number; // cached, refreshed on "Check comments"
  keyB64: string; // encryption key in base64url (for link reconstruction)
  fileCount: number; // number of files included in the share
  sharedPaths?: string[]; // relative paths of all files included in the share
}
```

Stored under `markreview-shares` key in localStorage.

#### `sharedPaths` and backward compatibility

`sharedPaths` was added after the initial release. Records created before this field existed will not have it. Any code that reads `sharedPaths` must treat it as optional and fall back gracefully.

#### Identifying the active share for a given file or folder (`ShareDialog`)

When the host opens `ShareDialog` for a file or folder, the dialog checks whether an existing non-expired share already covers the same entity, to avoid creating duplicates. The match is done by **entity path** — the canonical path of what is being shared:

- For a single file: the entity path is the file's relative path (e.g. `docs/intro.md`).
- For a folder share (multiple files): the entity path is the common path prefix of all `sharedPaths` (e.g. `docs/`).

For records that have `sharedPaths`, the entity path is derived from that field. For old records without `sharedPaths`, the match falls back to comparing `label` strings.

**Do not match on `label` alone for new records.** `label` is the human-readable basename used for display and the share URL — two different files in the same folder can have different paths but the same basename, and all shares within a directory tab share the same `tab.shares` array (keyed on `directoryName`). Matching by `label` alone would incorrectly treat a share of `dir/fileA.md` as an existing share for `dir/fileB.md` if the dialog for fileB is opened after fileA was shared.

---

## 9. New Components

```
App
├── (all v1 components unchanged)
├── ShareButton               — header button; opens ShareDialog
├── ShareDialog               — select file/folder, set expiry, trigger upload
├── SharedPanel               — right panel (or modal) listing active shares
│   ├── ShareEntry            — one active share: label, expiry, pending count
│   │   ├── RevokeButton
│   │   ├── UpdateButton
│   │   └── CheckCommentsButton
│   └── PendingCommentReview  — list of incoming peer comments to accept/dismiss
│       └── PeerCommentCard   — peer name, file path, block preview, comment text
└── PeerNamePrompt            — shown on first load in peer mode (display name input)
```

In **peer mode** (URL has `#share=...&key=...`):

- FilePicker is replaced by the decrypted folder tree directly
- All write actions (add/edit/delete comment, file save) are disabled
- Comment button is replaced by "Send comment" which POSTs encrypted blob to Worker

---

## 10. Store Additions

```typescript
// New state
shares: ShareRecord[]              // persisted to localStorage
peerName: string | null            // peer's self-declared name (sessionStorage)
isPeerMode: boolean                // true when viewing a shared link
sharedContent: SharePayload | null // decrypted content in peer mode

// New actions
shareContent: (opts: { ttl: number }) => Promise<string>    // returns shareable URL
revokeShare: (docId: string) => Promise<void>
updateShare: (docId: string) => Promise<void>
fetchPendingComments: (docId: string) => Promise<PeerComment[]>
mergeComment: (comment: PeerComment) => Promise<void>        // inserts CriticMarkup
dismissComment: (docId: string, cmtId: string) => void
postPeerComment: (blockIndex: number, type: CommentType, text: string) => Promise<void>
loadSharedContent: () => Promise<void>                       // peer mode init
```

---

## 11. Iteration Roadmap

---

### Iteration 2a — Cloudflare Worker + Encrypted Sharing

**Goal:** Host can encrypt and share a document. Peers can open the link and read the full document in the browser. No commenting yet.

---

**2a.1 — Cloudflare Worker scaffold**

- Create Worker project with `wrangler init`
- KV namespace bound as `KV`
- Implement `POST /share`, `GET /share/{id}`, `DELETE /share/{id}`
- CORS headers for GitHub Pages origin
- Deploy to `https://<subdomain>.workers.dev`
- **Deliverable:** Worker deployed; curl tests for upload/download/delete pass

**2a.2 — Encryption service**

- `src/services/crypto.ts`: `generateKey()`, `encrypt()`, `decrypt()`, `keyToBase64url()`, `base64urlToKey()`
- `src/services/compress.ts`: `compress()`, `decompress()` via Compression Streams API
- Unit tests for all functions: round-trip encrypt/decrypt, compress/decompress, key encoding
- **Deliverable:** Crypto service fully tested; encrypt → decrypt round-trip verified

**2a.3 — ShareStorage service**

- `src/services/shareStorage.ts` implementing `ShareStorage` interface
- `uploadContent()`: serialize + compress + encrypt → POST to Worker → return `{ docId, hostSecret }`
- `fetchContent()`: GET from Worker → decrypt + decompress → return `SharePayload`
- `deleteContent()`: DELETE with host-secret header
- Unit tests with mocked fetch
- **Deliverable:** ShareStorage service uploads and retrieves encrypted content via Worker

**2a.4 — Share dialog (host)**

- "Share file" and "Share folder" icon buttons in header (each hidden when not applicable)
- `ShareDialog` modal: shows file/folder name, expiry selector (1 day / 7 days / 30 days), "Generate Link" button
- On confirm: call `shareContent()`, copy link to clipboard, show toast "Link copied"
- Store `ShareRecord` in localStorage
- **Deliverable:** Host can generate a shareable link from the UI

**2a.5 — Peer mode: detect and load**

- On app init, check `location.hash` for `share=` and `key=` params
- If present: enter peer mode — fetch and decrypt content from Worker, reconstruct folder tree
- Show `PeerNamePrompt` to collect display name (stored in sessionStorage)
- Render decrypted content using the full v1 reading UI (sidebar + markdown renderer)
- All write actions disabled silently
- If fetch fails (expired/revoked): show "This document is no longer available"
- **Deliverable:** Peer opens link → enters name → sees the full document

**2a.6 — Shared panel (host)**

- "Shared" button in header opens `SharedPanel`
- Lists all active `ShareRecord` entries from localStorage
- Each entry: label, created date, expiry countdown, "Revoke" and "Update" buttons
- "Revoke": calls `deleteContent()`, removes from localStorage, shows toast
- "Update": re-encrypts current file state, calls `uploadContent()` with same expiry (new docId + new key → new link generated; old link stops working)
- **Deliverable:** Host can see, revoke, and update all active shares

**2a.7 — Iteration 2a testing**

- Unit tests: crypto round-trip, compression, ShareStorage (mocked Worker)
- Component tests: ShareDialog flow, PeerNamePrompt, SharedPanel entries
- Integration test: serialize folder → encrypt → decrypt → deserialize → verify tree matches original
- Integration test: share record persists in localStorage; revoke removes it
- Manual test: generate link → open in incognito tab → verify document renders correctly
- **Deliverable:** Test suite passes; end-to-end sharing verified manually

---

### Iteration 2b — Async Commenting

**Goal:** Peers can post comments. Host can fetch, review, and merge them into local files as CriticMarkup.

---

**2b.1 — Worker: comment endpoints**

- Add `POST /comments/{id}`, `GET /comments/{id}`, `DELETE /comments/{id}` to the Worker
- Comment blobs stored under `comments:{docId}:{cmtId}` with same TTL as the share
- Redeploy Worker
- **Deliverable:** Comment endpoints deployed; curl tests pass

**2b.2 — Peer comment posting**

- In peer mode: replace the "+" hover icon with a comment icon that opens a simplified form (name pre-filled from session, type selector, text input)
- On submit: construct `PeerComment` object, encrypt with the share key, POST to Worker
- Show confirmation toast "Comment saved"
- **Deliverable:** Peers can post comments from the shared document view

**2b.3 — Host: fetch and decrypt comments**

- `fetchComments(docId)` in ShareStorage: GET all comment blobs, decrypt each, return `PeerComment[]`
- "Check comments" button on each `ShareEntry` in `SharedPanel`
- Shows pending count badge; updates `pendingCommentCount` in localStorage
- **Deliverable:** Host can fetch and see all pending peer comments in the Shared panel

**2b.4 — Peer comment review UI**

- `PendingCommentReview` component inside `SharedPanel`
- Each `PeerCommentCard` shows: peer name, file path, block content preview, comment type badge, comment text, "Merge" and "Dismiss" buttons
- Dismiss: removes from pending list (no Worker call — the comment stays but is ignored)
- **Deliverable:** Host can read all pending comments with full context before deciding

**2b.5 — Comment merge**

- "Merge" on a `PeerCommentCard`: find the target file and block in the local folder
- Insert CriticMarkup at the correct block position using the existing `insertComment` service
- Append peer attribution: `{>>fix: This claim needs evidence. — Alex<<}`
- Write file back to disk, re-parse, update comment panel
- Remove the merged comment from the pending review list
- **Deliverable:** Host can merge a peer comment into the local file as CriticMarkup in one click

**2b.6 — Bulk merge / dismiss**

- "Merge all" and "Dismiss all" buttons at the top of `PendingCommentReview`
- "Clear comments" button on `ShareEntry` — calls `deleteComments()` on the Worker to clean up
- **Deliverable:** Host can process all pending comments efficiently

**2b.7 — Iteration 2b testing**

- Unit tests: `PeerComment` serialization, encryption round-trip for comments
- Unit tests: comment merge → correct CriticMarkup inserted at correct block position
- Unit tests: peer attribution suffix appended correctly
- Integration test: peer posts comment → host fetches → host merges → verify CriticMarkup in file
- Integration test: bulk merge writes all comments without corrupting file
- Component tests: PeerCommentCard, PendingCommentReview, SharedPanel with badge
- Manual test: full peer → host flow with a real markdown document
- **Deliverable:** Test suite passes; full async comment workflow verified end-to-end

---

## 12. Security Model

| Layer                 | Protected             | How                                       |
| --------------------- | --------------------- | ----------------------------------------- |
| Content at rest (KV)  | File content          | AES-256-GCM, key only in URL fragment     |
| Comments at rest (KV) | Peer comments         | AES-256-GCM, same key                     |
| Content in transit    | Worker requests       | TLS (Cloudflare)                          |
| Cloudflare Worker/KV  | Cannot read anything  | Only stores opaque encrypted blobs        |
| Delete operations     | Unauthorized deletion | host-secret header, SHA-256 hashed in KV  |
| Key distribution      | Never hits any server | URL fragment is not sent in HTTP requests |

**Threat model:** An attacker with access to Cloudflare KV sees only encrypted blobs. An attacker intercepting HTTPS traffic sees only encrypted blobs. An attacker with the full shareable URL (including fragment) can read the content — same risk level as sharing a Notion link or Google Doc link.

---

## 13. Cloudflare Setup (One-Time, ~10 Minutes)

1. Create free Cloudflare account
2. `npm create cloudflare@latest markreview-worker`
3. Create KV namespace: `wrangler kv:namespace create STORE`
4. Set `ALLOWED_ORIGIN` environment variable to the GitHub Pages URL
5. `wrangler deploy`
6. Copy the Worker URL into the app's config (`VITE_WORKER_URL` env var)

The Worker URL is stored in `VITE_WORKER_URL` at build time. The app reads it from `import.meta.env.VITE_WORKER_URL`.

---

## 14. Known Limitations & Tradeoffs

| Limitation                                 | Acceptable Because                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| Cloudflare account required from host      | One-time ~10 min setup; free tier sufficient for 2–5 peers                          |
| No real-time sync                          | Async review workflow doesn't need it; v3 adds WebRTC                               |
| No persistent peer identity                | 2–5 trusted peers; self-declared name is sufficient                                 |
| KV 25MB blob limit                         | Hundreds of markdown files fit easily; split across multiple KV entries if exceeded |
| Peers can comment even after share expires | Comment blobs share the same TTL as the content — both expire together              |
| "Update" generates a new link              | Acceptable tradeoff; old link stops working, host re-shares new link                |
| No conflict resolution for merge           | Comments are appended to file — no concurrent editing, just appending CriticMarkup  |
