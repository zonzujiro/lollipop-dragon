interface Env {
  KV: KVNamespace
  ALLOWED_ORIGIN: string
}

interface ShareMeta {
  hostSecretHash: string
  createdAt: string
  ttl: number
  label: string
}

// --- Helpers ---

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Host-Secret',
  }
}

function jsonRes(data: unknown, cors: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function errRes(status: number, msg: string, cors: Record<string, string>): Response {
  return jsonRes({ error: msg }, cors, status)
}

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function getMeta(env: Env, docId: string): Promise<ShareMeta | null> {
  const raw = await env.KV.get(`share:${docId}:meta`)
  if (!raw) return null
  return JSON.parse(raw) as ShareMeta
}

async function verifySecret(req: Request, env: Env, docId: string): Promise<boolean> {
  const meta = await getMeta(env, docId)
  if (!meta) return false
  const secret = req.headers.get('X-Host-Secret') ?? ''
  const hash = await sha256hex(secret)
  return hash === meta.hostSecretHash
}

// --- Main handler ---

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const cors = corsHeaders(env.ALLOWED_ORIGIN)

    if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

    const parts = url.pathname.replace(/^\//, '').split('/')
    const [resource, docId] = parts

    // ── /share ──────────────────────────────────────────────────────────
    if (resource === 'share') {
      // POST /share  — upload content
      if (req.method === 'POST' && !docId) {
        const blob = await req.arrayBuffer()
        if (blob.byteLength > 25 * 1024 * 1024) return errRes(413, 'Blob too large', cors)
        const id = crypto.randomUUID()
        const ttl = Math.min(Number(url.searchParams.get('ttl') ?? 604800), 30 * 86400)
        const label = url.searchParams.get('label') ?? ''
        const hostSecret = req.headers.get('X-Host-Secret') ?? ''
        if (!hostSecret) return errRes(400, 'X-Host-Secret required', cors)
        const hostSecretHash = await sha256hex(hostSecret)
        await env.KV.put(`share:${id}`, blob, { expirationTtl: ttl })
        await env.KV.put(`share:${id}:meta`, JSON.stringify({
          hostSecretHash,
          createdAt: new Date().toISOString(),
          ttl,
          label,
        } satisfies ShareMeta))
        return jsonRes({ docId: id }, cors)
      }

      // GET /share/:docId  — fetch content
      if (req.method === 'GET' && docId) {
        const blob = await env.KV.get(`share:${docId}`, 'arrayBuffer')
        if (!blob) return errRes(404, 'Not found', cors)
        return new Response(blob, {
          headers: { ...cors, 'Content-Type': 'application/octet-stream' },
        })
      }

      // DELETE /share/:docId  — revoke share
      if (req.method === 'DELETE' && docId) {
        if (!await verifySecret(req, env, docId)) return errRes(403, 'Forbidden', cors)
        await env.KV.delete(`share:${docId}`)
        await env.KV.delete(`share:${docId}:meta`)
        return jsonRes({ ok: true }, cors)
      }
    }

    // ── /comments ────────────────────────────────────────────────────────
    if (resource === 'comments' && docId) {
      // POST /comments/:docId  — post a comment
      if (req.method === 'POST') {
        const meta = await getMeta(env, docId)
        if (!meta) return errRes(404, 'Share not found', cors)
        const blob = await req.arrayBuffer()
        if (blob.byteLength > 1024 * 1024) return errRes(413, 'Comment too large', cors)
        const cmtId = crypto.randomUUID()
        await env.KV.put(`comments:${docId}:${cmtId}`, blob, { expirationTtl: meta.ttl })
        return jsonRes({ cmtId }, cors)
      }

      // GET /comments/:docId  — list comments
      if (req.method === 'GET') {
        const list = await env.KV.list({ prefix: `comments:${docId}:` })
        const blobs = await Promise.all(
          list.keys.map((k) => env.KV.get(k.name, 'arrayBuffer')),
        )
        const encoded = blobs
          .filter((b): b is ArrayBuffer => b !== null)
          .map((b) => btoa(String.fromCharCode(...new Uint8Array(b))))
        return jsonRes(encoded, cors)
      }

      // DELETE /comments/:docId  — clear all comments for a share
      if (req.method === 'DELETE') {
        if (!await verifySecret(req, env, docId)) return errRes(403, 'Forbidden', cors)
        const list = await env.KV.list({ prefix: `comments:${docId}:` })
        await Promise.all(list.keys.map((k) => env.KV.delete(k.name)))
        return jsonRes({ ok: true }, cors)
      }
    }

    return errRes(404, 'Not found', cors)
  },
}
