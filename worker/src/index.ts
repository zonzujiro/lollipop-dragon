interface Env {
  LOLLIPOP_DRAGON: KVNamespace;
  ALLOWED_ORIGINS: string;
}

interface ShareMeta {
  hostSecretHash: string;
  createdAt: string;
  updatedAt?: string;
  ttl: number;
  label: string;
}

// --- Helpers ---

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Host-Secret",
    "Access-Control-Expose-Headers": "Last-Modified, X-Comment-Count",
  };
}

function jsonRes(
  data: unknown,
  cors: Record<string, string>,
  status = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function errRes(
  status: number,
  msg: string,
  cors: Record<string, string>,
): Response {
  return jsonRes({ error: msg }, cors, status);
}

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getMeta(env: Env, docId: string): Promise<ShareMeta | null> {
  const raw = await env.LOLLIPOP_DRAGON.get(`share:${docId}:meta`);
  if (!raw) {
    return null;
  }
  try {
    const parsed: ShareMeta = JSON.parse(raw);
    return parsed;
  } catch (parseError) {
    console.error("[getMeta] JSON parse failed:", parseError);
    return null;
  }
}

async function verifySecret(
  req: Request,
  env: Env,
  docId: string,
): Promise<boolean> {
  const meta = await getMeta(env, docId);
  if (!meta) return false;
  const secret = req.headers.get("X-Host-Secret") ?? "";
  const hash = await sha256hex(secret);
  return hash === meta.hostSecretHash;
}

// --- Main handler ---

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") ?? "";
    const allowed = env.ALLOWED_ORIGINS.split(",");
    const matchedOrigin = allowed.includes(origin) ? origin : allowed[0];
    const cors = corsHeaders(matchedOrigin);

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    try {
      const parts = url.pathname.replace(/^\//, "").split("/");
      const [resource, docId] = parts;

      // ── /share ──────────────────────────────────────────────────────────
      if (resource === "share") {
        // POST /share/:docId  — upload content (client provides docId)
        if (req.method === "POST" && docId) {
          const existing = await env.LOLLIPOP_DRAGON.get(`share:${docId}:meta`);
          if (existing) return errRes(409, "Document already exists", cors);
          const blob = await req.arrayBuffer();
          if (blob.byteLength > 25 * 1024 * 1024)
            return errRes(413, "Blob too large", cors);
          const ttl = Math.min(
            Number(url.searchParams.get("ttl") ?? 604800),
            30 * 86400,
          );
          const label = url.searchParams.get("label") ?? "";
          const hostSecret = req.headers.get("X-Host-Secret") ?? "";
          if (!hostSecret) return errRes(400, "X-Host-Secret required", cors);
          const hostSecretHash = await sha256hex(hostSecret);
          await env.LOLLIPOP_DRAGON.put(`share:${docId}`, blob, {
            expirationTtl: ttl,
          });
          const now = new Date().toISOString();
          await env.LOLLIPOP_DRAGON.put(
            `share:${docId}:meta`,
            JSON.stringify({
              hostSecretHash,
              createdAt: now,
              updatedAt: now,
              ttl,
              label,
            } satisfies ShareMeta),
            { expirationTtl: ttl },
          );
          return jsonRes({ ok: true }, cors);
        }

        // GET /share/:docId  — fetch content
        if (req.method === "GET" && docId) {
          const blob = await env.LOLLIPOP_DRAGON.get(
            `share:${docId}`,
            "arrayBuffer",
          );
          if (!blob) return errRes(404, "Not found", cors);
          return new Response(blob, {
            headers: { ...cors, "Content-Type": "application/octet-stream" },
          });
        }

        // PUT /share/:docId  — update content in-place
        if (req.method === "PUT" && docId) {
          if (!(await verifySecret(req, env, docId)))
            return errRes(403, "Forbidden", cors);
          const meta = await getMeta(env, docId);
          if (!meta) return errRes(404, "Not found", cors);
          const blob = await req.arrayBuffer();
          if (blob.byteLength > 25 * 1024 * 1024)
            return errRes(413, "Blob too large", cors);
          const remainingTtl = Math.max(
            meta.ttl -
              Math.round(
                (Date.now() - new Date(meta.createdAt).getTime()) / 1000,
              ),
            3600,
          );
          await env.LOLLIPOP_DRAGON.put(`share:${docId}`, blob, {
            expirationTtl: remainingTtl,
          });
          const updatedMeta: ShareMeta = {
            ...meta,
            updatedAt: new Date().toISOString(),
          };
          await env.LOLLIPOP_DRAGON.put(
            `share:${docId}:meta`,
            JSON.stringify(updatedMeta),
            { expirationTtl: remainingTtl },
          );
          return jsonRes({ ok: true }, cors);
        }

        // HEAD /share/:docId  — cheap content-updated check
        if (req.method === "HEAD" && docId) {
          const meta = await getMeta(env, docId);
          if (!meta) return new Response(null, { status: 404, headers: cors });
          return new Response(null, {
            status: 200,
            headers: {
              ...cors,
              "Last-Modified": meta.updatedAt ?? meta.createdAt,
            },
          });
        }

        // DELETE /share/:docId  — revoke share
        if (req.method === "DELETE" && docId) {
          if (!(await verifySecret(req, env, docId)))
            return errRes(403, "Forbidden", cors);
          await env.LOLLIPOP_DRAGON.delete(`share:${docId}`);
          await env.LOLLIPOP_DRAGON.delete(`share:${docId}:meta`);
          return jsonRes({ ok: true }, cors);
        }
      }

      // ── /comments ────────────────────────────────────────────────────────
      if (resource === "comments" && docId) {
        // POST /comments/:docId  — post a comment
        if (req.method === "POST") {
          const meta = await getMeta(env, docId);
          if (!meta) return errRes(404, "Share not found", cors);
          const blob = await req.arrayBuffer();
          if (blob.byteLength > 1024 * 1024)
            return errRes(413, "Comment too large", cors);
          const cmtId = crypto.randomUUID();
          await env.LOLLIPOP_DRAGON.put(`comments:${docId}:${cmtId}`, blob, {
            expirationTtl: meta.ttl,
          });
          return jsonRes({ cmtId }, cors);
        }

        // GET /comments/:docId  — list comments
        if (req.method === "GET") {
          const list = await env.LOLLIPOP_DRAGON.list({
            prefix: `comments:${docId}:`,
          });
          const blobs = await Promise.all(
            list.keys.map((k) =>
              env.LOLLIPOP_DRAGON.get(k.name, "arrayBuffer"),
            ),
          );
          const encoded = blobs
            .filter((b): b is ArrayBuffer => b !== null)
            .map((b) => arrayBufferToBase64(b));
          return jsonRes(encoded, cors);
        }

        // HEAD /comments/:docId  — cheap comment-count check
        if (req.method === "HEAD") {
          const list = await env.LOLLIPOP_DRAGON.list({
            prefix: `comments:${docId}:`,
          });
          return new Response(null, {
            status: 200,
            headers: { ...cors, "X-Comment-Count": String(list.keys.length) },
          });
        }

        // DELETE /comments/:docId  — clear all comments for a share
        if (req.method === "DELETE") {
          if (!(await verifySecret(req, env, docId)))
            return errRes(403, "Forbidden", cors);
          const list = await env.LOLLIPOP_DRAGON.list({
            prefix: `comments:${docId}:`,
          });
          await Promise.all(
            list.keys.map((k) => env.LOLLIPOP_DRAGON.delete(k.name)),
          );
          return jsonRes({ ok: true }, cors);
        }
      }

      return errRes(404, "Not found", cors);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Internal error";
      return errRes(500, msg, cors);
    }
  },
};
