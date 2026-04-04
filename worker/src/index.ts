interface Env {
  LOLLIPOP_DRAGON: KVNamespace;
  ALLOWED_ORIGINS: string;
  RELAY_HUB: DurableObjectNamespace;
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
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isShareMeta(value: unknown): value is ShareMeta {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value["hostSecretHash"] !== "string") {
    return false;
  }
  if (typeof value["createdAt"] !== "string") {
    return false;
  }
  if (typeof value["ttl"] !== "number") {
    return false;
  }
  if (typeof value["label"] !== "string") {
    return false;
  }
  if (
    "updatedAt" in value &&
    value["updatedAt"] !== undefined &&
    typeof value["updatedAt"] !== "string"
  ) {
    return false;
  }
  return true;
}

async function getMeta(env: Env, docId: string): Promise<ShareMeta | null> {
  const raw = await env.LOLLIPOP_DRAGON.get(`share:${docId}:meta`);
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isShareMeta(parsed)) {
    return null;
  }
  return parsed;
}

async function verifySecret(
  req: Request,
  env: Env,
  docId: string,
): Promise<boolean> {
  const meta = await getMeta(env, docId);
  if (!meta) {
    return false;
  }
  const secret = req.headers.get("X-Host-Secret") ?? "";
  const hash = await sha256hex(secret);
  return hash === meta.hostSecretHash;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let index = 0; index < bytes.length; index++) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

// --- Route handlers ---

async function handleRelay(
  req: Request,
  env: Env,
  cors: Record<string, string>,
  allowed: string[],
): Promise<Response> {
  if (req.headers.get("Upgrade") !== "websocket") {
    return errRes(426, "WebSocket upgrade required", cors);
  }
  // Validate origin for WebSocket upgrades (CORS doesn't protect WebSockets)
  const wsOrigin = req.headers.get("Origin") ?? "";
  if (!allowed.includes(wsOrigin)) {
    return errRes(403, "Origin not allowed", cors);
  }
  const hubId = env.RELAY_HUB.idFromName("hub");
  const hub = env.RELAY_HUB.get(hubId);
  return hub.fetch(req);
}

const MAX_BLOB_SIZE = 25 * 1024 * 1024;
const MAX_TTL_SECONDS = 30 * 86400;
const DEFAULT_TTL_SECONDS = 604800;

function parseShareParams(url: URL, req: Request) {
  const ttl = Math.min(
    Number(url.searchParams.get("ttl") ?? DEFAULT_TTL_SECONDS),
    MAX_TTL_SECONDS,
  );
  const label = url.searchParams.get("label") ?? "";
  const hostSecret = req.headers.get("X-Host-Secret") ?? "";
  return { ttl, label, hostSecret };
}

async function createShare(
  req: Request,
  env: Env,
  cors: Record<string, string>,
  url: URL,
  docId: string,
): Promise<Response> {
  const existing = await env.LOLLIPOP_DRAGON.get(`share:${docId}:meta`);
  if (existing) {
    return errRes(409, "Document already exists", cors);
  }
  const blob = await req.arrayBuffer();
  if (blob.byteLength > MAX_BLOB_SIZE) {
    return errRes(413, "Blob too large", cors);
  }
  const { ttl, label, hostSecret } = parseShareParams(url, req);
  if (!hostSecret) {
    return errRes(400, "X-Host-Secret required", cors);
  }
  const hostSecretHash = await sha256hex(hostSecret);
  const now = new Date().toISOString();
  const meta = {
    hostSecretHash,
    createdAt: now,
    updatedAt: now,
    ttl,
    label,
  } satisfies ShareMeta;
  await env.LOLLIPOP_DRAGON.put(`share:${docId}`, blob, { expirationTtl: ttl });
  await env.LOLLIPOP_DRAGON.put(`share:${docId}:meta`, JSON.stringify(meta), {
    expirationTtl: ttl,
  });
  return jsonRes({ ok: true }, cors);
}

async function getShareContent(
  env: Env,
  cors: Record<string, string>,
  docId: string,
): Promise<Response> {
  const blob = await env.LOLLIPOP_DRAGON.get(`share:${docId}`, "arrayBuffer");
  if (!blob) {
    return errRes(404, "Not found", cors);
  }
  return new Response(blob, {
    headers: { ...cors, "Content-Type": "application/octet-stream" },
  });
}

function computeRemainingTtl(meta: ShareMeta): number {
  const elapsed = Math.round(
    (Date.now() - new Date(meta.createdAt).getTime()) / 1000,
  );
  return Math.max(meta.ttl - elapsed, 3600);
}

async function updateShareContent(
  req: Request,
  env: Env,
  cors: Record<string, string>,
  docId: string,
): Promise<Response> {
  if (!(await verifySecret(req, env, docId))) {
    return errRes(403, "Forbidden", cors);
  }
  const meta = await getMeta(env, docId);
  if (!meta) {
    return errRes(404, "Not found", cors);
  }
  const blob = await req.arrayBuffer();
  if (blob.byteLength > 25 * 1024 * 1024) {
    return errRes(413, "Blob too large", cors);
  }
  const remainingTtl = computeRemainingTtl(meta);
  const updatedMeta: ShareMeta = {
    ...meta,
    updatedAt: new Date().toISOString(),
  };
  await env.LOLLIPOP_DRAGON.put(`share:${docId}`, blob, {
    expirationTtl: remainingTtl,
  });
  await env.LOLLIPOP_DRAGON.put(
    `share:${docId}:meta`,
    JSON.stringify(updatedMeta),
    { expirationTtl: remainingTtl },
  );
  return jsonRes({ ok: true }, cors);
}

async function headShare(
  env: Env,
  cors: Record<string, string>,
  docId: string,
): Promise<Response> {
  const meta = await getMeta(env, docId);
  if (!meta) {
    return new Response(null, { status: 404, headers: cors });
  }
  return new Response(null, {
    status: 200,
    headers: { ...cors, "Last-Modified": meta.updatedAt ?? meta.createdAt },
  });
}

async function deleteShare(
  req: Request,
  env: Env,
  cors: Record<string, string>,
  docId: string,
): Promise<Response> {
  if (!(await verifySecret(req, env, docId))) {
    return errRes(403, "Forbidden", cors);
  }
  await env.LOLLIPOP_DRAGON.delete(`share:${docId}`);
  await env.LOLLIPOP_DRAGON.delete(`share:${docId}:meta`);
  return jsonRes({ ok: true }, cors);
}

async function handleShare(
  req: Request,
  env: Env,
  cors: Record<string, string>,
  url: URL,
  docId: string,
): Promise<Response | null> {
  const handlers: Record<string, () => Promise<Response>> = {
    POST: () => createShare(req, env, cors, url, docId),
    GET: () => getShareContent(env, cors, docId),
    PUT: () => updateShareContent(req, env, cors, docId),
    HEAD: () => headShare(env, cors, docId),
    DELETE: () => deleteShare(req, env, cors, docId),
  };
  const handler = handlers[req.method];
  return handler ? handler() : null;
}

async function postComment(
  req: Request,
  env: Env,
  cors: Record<string, string>,
  docId: string,
): Promise<Response> {
  const meta = await getMeta(env, docId);
  if (!meta) {
    return errRes(404, "Share not found", cors);
  }
  const blob = await req.arrayBuffer();
  if (blob.byteLength > 1024 * 1024) {
    return errRes(413, "Comment too large", cors);
  }
  const newCmtId = crypto.randomUUID();
  await env.LOLLIPOP_DRAGON.put(`comments:${docId}:${newCmtId}`, blob, {
    expirationTtl: meta.ttl,
  });
  return jsonRes({ cmtId: newCmtId }, cors);
}

async function listComments(
  env: Env,
  cors: Record<string, string>,
  docId: string,
): Promise<Response> {
  const list = await env.LOLLIPOP_DRAGON.list({
    prefix: `comments:${docId}:`,
  });
  const blobs = await Promise.all(
    list.keys.map((key) => env.LOLLIPOP_DRAGON.get(key.name, "arrayBuffer")),
  );
  const encoded = blobs
    .filter((blob): blob is ArrayBuffer => blob !== null)
    .map((blob) => arrayBufferToBase64(blob));
  return jsonRes(encoded, cors);
}

async function headComments(
  env: Env,
  cors: Record<string, string>,
  docId: string,
): Promise<Response> {
  const list = await env.LOLLIPOP_DRAGON.list({
    prefix: `comments:${docId}:`,
  });
  return new Response(null, {
    status: 200,
    headers: { ...cors, "X-Comment-Count": String(list.keys.length) },
  });
}

async function deleteSingleComment(
  req: Request,
  env: Env,
  cors: Record<string, string>,
  docId: string,
  cmtId: string,
): Promise<Response> {
  if (!(await verifySecret(req, env, docId))) {
    return errRes(403, "Forbidden", cors);
  }
  await env.LOLLIPOP_DRAGON.delete(`comments:${docId}:${cmtId}`);
  return jsonRes({ ok: true }, cors);
}

async function deleteAllComments(
  req: Request,
  env: Env,
  cors: Record<string, string>,
  docId: string,
): Promise<Response> {
  if (!(await verifySecret(req, env, docId))) {
    return errRes(403, "Forbidden", cors);
  }
  const list = await env.LOLLIPOP_DRAGON.list({
    prefix: `comments:${docId}:`,
  });
  await Promise.all(
    list.keys.map((key) => env.LOLLIPOP_DRAGON.delete(key.name)),
  );
  return jsonRes({ ok: true }, cors);
}

async function handleComments(
  req: Request,
  env: Env,
  cors: Record<string, string>,
  docId: string,
  cmtId: string | undefined,
): Promise<Response | null> {
  const deleteHandler = cmtId
    ? () => deleteSingleComment(req, env, cors, docId, cmtId)
    : () => deleteAllComments(req, env, cors, docId);

  const handlers: Record<string, () => Promise<Response>> = {
    POST: () => postComment(req, env, cors, docId),
    GET: () => listComments(env, cors, docId),
    HEAD: () => headComments(env, cors, docId),
    DELETE: deleteHandler,
  };
  const handler = handlers[req.method];
  return handler ? handler() : null;
}

// --- Main handler ---

export { RelayHub } from "./relay";

async function routeRequest(
  req: Request,
  env: Env,
  cors: Record<string, string>,
  url: URL,
  allowed: string[],
): Promise<Response> {
  const parts = url.pathname.replace(/^\//, "").split("/");
  const [resource, docId] = parts;

  if (resource === "relay") {
    return handleRelay(req, env, cors, allowed);
  }
  if (resource === "share") {
    const result = await handleShare(req, env, cors, url, docId);
    if (result) {
      return result;
    }
  }
  if (resource === "comments" && docId) {
    const result = await handleComments(req, env, cors, docId, parts[2]);
    if (result) {
      return result;
    }
  }
  return errRes(404, "Not found", cors);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") ?? "";
    const allowed = env.ALLOWED_ORIGINS.split(",");
    const matchedOrigin = allowed.includes(origin) ? origin : allowed[0];
    const cors = corsHeaders(matchedOrigin);

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    try {
      return await routeRequest(req, env, cors, url, allowed);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Internal error";
      return errRes(500, msg, cors);
    }
  },
};
