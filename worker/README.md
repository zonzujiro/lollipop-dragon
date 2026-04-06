# markreview-worker

Cloudflare Worker backend for encrypted share delivery and real-time peer comment sync.

## Free plan deployment note

Cloudflare Workers Free only supports SQLite-backed Durable Objects. This Worker must therefore be deployed as a fresh Worker service with a SQLite-only Durable Object migration history.

The checked-in `wrangler.toml` is configured for that cutover:

- Worker name: `markreview-worker-v2`
- Durable Object class: `RelayHubSqlite`
- single migration: `new_sqlite_classes = ["RelayHubSqlite"]`

Do not reintroduce a legacy `new_classes` Durable Object migration on this Worker if you intend to deploy it on the free plan.

## Responsibilities

- Stores encrypted share content in KV at `share:{docId}`
- Stores share metadata in KV at `share:{docId}:meta`
- Terminates the WebSocket relay at `/relay`
- Uses a SQLite-backed Durable Object (`RelayHubSqlite`) as the durable store for unresolved peer comments
- Clears relay comment state when a share is revoked

## Setup

1. Install Wrangler:

```bash
npm install -g wrangler
```

2. Authenticate:

```bash
wrangler login
```

3. Create the KV namespace and put the returned `id` into `wrangler.toml`:

```bash
wrangler kv:namespace create LOLLIPOP_DRAGON
```

4. Configure allowed origins in `wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://critiq.ink,https://YOUR_USERNAME.github.io"
```

5. Deploy:

```bash
wrangler deploy
```

6. Set the deployed worker URL as `VITE_WORKER_URL` in the app:

```bash
VITE_WORKER_URL=https://markreview-worker-v2.YOUR_ACCOUNT.workers.dev
```

The app normalizes a trailing slash in `VITE_WORKER_URL`, so both of these work:

```bash
VITE_WORKER_URL=https://markreview-worker-v2.YOUR_ACCOUNT.workers.dev
VITE_WORKER_URL=https://markreview-worker-v2.YOUR_ACCOUNT.workers.dev/
```

## Public API

### Share content

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/share/:docId?ttl=<seconds>&label=<name>` | Upload encrypted share content. Requires `X-Host-Secret`. Returns `{ ok: true }`. |
| `GET` | `/share/:docId` | Fetch encrypted share content blob. |
| `PUT` | `/share/:docId` | Replace encrypted share content. Requires `X-Host-Secret`. |
| `HEAD` | `/share/:docId` | Returns `Last-Modified` metadata for the share. |
| `DELETE` | `/share/:docId` | Delete the share and clear relay comment state. Requires `X-Host-Secret`. |

### Relay

| Transport | Path | Description |
|-----------|------|-------------|
| WebSocket | `/relay` | Real-time comment relay and durable unresolved-comment store via `RelayHubSqlite`. |

There is no public `/comments/*` REST API anymore. Unresolved peer comments are stored inside the Durable Object SQLite tables and delivered over WebSocket frames.

## Relay model

- One WebSocket per client
- Single shared relay hub, multiplexed by `docId`
- Host subscribes with `role: "host"` plus `hostSecret`
- Peer subscribes with `role: "peer"`
- Peer `comment:add` frames are stored durably in SQLite, ACKed, then forwarded to subscribed host sockets
- Host `comment:resolve` frames delete from SQLite, ACK, then forward to all subscribers
- Host subscribe receives a `comments:snapshot` of unresolved comments for that `docId`

## Security

- Share content remains opaque encrypted binary in KV.
- Comment payloads are encrypted before they reach the Worker or Durable Object.
- The Durable Object only sees control metadata: `docId`, `cmtId`, role, and encrypted payload.
- `X-Host-Secret` is hashed before storage in share metadata.
- Host-only operations use the raw `hostSecret` for verification:
  - `PUT /share/:docId`
  - `DELETE /share/:docId`
  - host WebSocket subscribe for comment resolution authority

## Data retention

- Share content and share metadata use KV TTL.
- Unresolved comments in SQLite inherit the share expiry and are removed by:
  - `comment:resolve`
  - share revoke
  - Durable Object alarm cleanup after expiry
