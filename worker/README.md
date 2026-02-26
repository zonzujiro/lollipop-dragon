# markreview-worker

Cloudflare Worker that acts as an encrypted blob store for MarkReview v2 peer sharing.

## Setup (~10 minutes)

1. Install Wrangler: `npm install -g wrangler`
2. Log in: `wrangler login`
3. Create KV namespace:
   ```
   wrangler kv:namespace create STORE
   ```
   Copy the returned `id` into `wrangler.toml` under `[[kv_namespaces]]`.

4. Set your GitHub Pages URL in `wrangler.toml`:
   ```toml
   [vars]
   ALLOWED_ORIGIN = "https://YOUR_USERNAME.github.io"
   ```

5. Deploy:
   ```
   wrangler deploy
   ```

6. Copy the Worker URL (e.g. `https://markreview-worker.YOUR_ACCOUNT.workers.dev`) and set it as `VITE_WORKER_URL` in the main app's `.env.local`:
   ```
   VITE_WORKER_URL=https://markreview-worker.YOUR_ACCOUNT.workers.dev
   ```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /share | Upload encrypted content blob → returns `{ docId }` |
| GET | /share/:docId | Fetch encrypted content blob |
| DELETE | /share/:docId | Delete share (requires X-Host-Secret header) |
| POST | /comments/:docId | Post encrypted comment blob → returns `{ cmtId }` |
| GET | /comments/:docId | Fetch all comment blobs as base64 JSON array |
| DELETE | /comments/:docId | Delete all comments for a share (requires X-Host-Secret) |

## Security

- All blobs are opaque encrypted binary. The Worker never sees plaintext.
- `X-Host-Secret` is hashed (SHA-256) before storing. DELETE requires the raw secret.
- KV TTL auto-purges all data. Default: 7 days.
