interface RelayEnv {
  LOLLIPOP_DRAGON: KVNamespace;
}

interface RelayShareMeta {
  hostSecretHash: string;
  createdAt: string;
  ttl: number;
}

interface SocketAttachment {
  subscriptions: string[];
  hostDocs: string[];
}

interface ClearDocRequest {
  docId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRelayShareMeta(value: unknown): value is RelayShareMeta {
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
  return true;
}

function parseShareMeta(metaJson: string): RelayShareMeta | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(metaJson);
  } catch {
    return null;
  }
  if (!isRelayShareMeta(parsed)) {
    return null;
  }
  return parsed;
}

function isClearDocRequest(value: unknown): value is ClearDocRequest {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value["docId"] === "string";
}

function getAttachment(ws: WebSocket): SocketAttachment {
  const raw = ws.deserializeAttachment();
  if (raw && Array.isArray(raw.subscriptions)) {
    return {
      subscriptions: raw.subscriptions,
      hostDocs: Array.isArray(raw.hostDocs) ? raw.hostDocs : [],
    };
  }
  return { subscriptions: [], hostDocs: [] };
}

function setAttachment(ws: WebSocket, attachment: SocketAttachment): void {
  ws.serializeAttachment(attachment);
}

async function sha256hex(text: string): Promise<string> {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseMessage(
  ws: WebSocket,
  message: string | ArrayBuffer,
): Record<string, unknown> | null {
  let data: unknown;
  try {
    const text =
      typeof message === "string" ? message : new TextDecoder().decode(message);
    data = JSON.parse(text);
  } catch (parseError) {
    console.error("[RelayHubSqlite] invalid JSON from client:", parseError);
    ws.send(
      JSON.stringify({ type: "error", docId: "", message: "Invalid JSON" }),
    );
    return null;
  }
  if (!isRecord(data)) {
    ws.send(
      JSON.stringify({ type: "error", docId: "", message: "Invalid frame" }),
    );
    return null;
  }
  return data;
}

export class RelayHubSqlite implements DurableObject {
  private sql: SqlStorage;

  private frameHandlers: Record<
    string,
    (ws: WebSocket, frame: Record<string, unknown>) => Promise<void> | void
  > = {
    ping: (ws) => ws.send(JSON.stringify({ type: "pong" })),
    subscribe: (ws, frame) => this.handleSubscribe(ws, frame),
    unsubscribe: (ws, frame) => this.handleUnsubscribe(ws, frame),
    "comment:add": (ws, frame) => this.handleCommentAdd(ws, frame),
    "comment:resolve": (ws, frame) => this.handleCommentResolve(ws, frame),
  };

  constructor(
    private state: DurableObjectState,
    private env: RelayEnv,
  ) {
    this.sql = state.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS doc_meta (
        doc_id TEXT PRIMARY KEY,
        host_secret_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS comments (
        doc_id TEXT NOT NULL,
        cmt_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (doc_id, cmt_id)
      )
    `);
    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS comments_by_doc
      ON comments (doc_id, created_at)
    `);
    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS comments_by_expiry
      ON comments (expires_at)
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const requestUrl = new URL(request.url);
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      setAttachment(server, { subscriptions: [], hostDocs: [] });
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "POST" && requestUrl.pathname === "/internal/clear") {
      const body: unknown = await request.json();
      if (!isClearDocRequest(body)) {
        return new Response("Bad Request", { status: 400 });
      }
      this.clearDoc(body.docId);
      await this.scheduleNextAlarm();
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    const frame = parseMessage(ws, message);
    if (!frame) {
      return;
    }
    const frameType = typeof frame.type === "string" ? frame.type : "";
    const handler = this.frameHandlers[frameType];
    if (!handler) {
      ws.send(
        JSON.stringify({ type: "error", docId: "", message: "Unknown frame" }),
      );
      return;
    }
    await handler(ws, frame);
  }

  private clearDoc(docId: string): void {
    this.sql.exec("DELETE FROM comments WHERE doc_id = ?", docId);
    this.sql.exec("DELETE FROM doc_meta WHERE doc_id = ?", docId);
  }

  private async handleSubscribe(
    ws: WebSocket,
    frame: Record<string, unknown>,
  ): Promise<void> {
    if (typeof frame.docId !== "string") {
      return;
    }

    const docId = frame.docId;
    const role = frame.role === "host" ? "host" : "peer";
    const metaJson = await this.env.LOLLIPOP_DRAGON.get(`share:${docId}:meta`);
    if (!metaJson) {
      this.clearDoc(docId);
      ws.send(JSON.stringify({ type: "error", docId, message: "Doc not found" }));
      return;
    }

    const meta = parseShareMeta(metaJson);
    if (!meta) {
      ws.send(
        JSON.stringify({ type: "error", docId, message: "Invalid share metadata" }),
      );
      return;
    }

    const expiresAt = new Date(meta.createdAt).getTime() + meta.ttl * 1000;
    if (expiresAt <= Date.now()) {
      this.clearDoc(docId);
      ws.send(JSON.stringify({ type: "error", docId, message: "Share expired" }));
      return;
    }

    let isHost = false;
    if (role === "host") {
      isHost = await this.verifyHostRole(frame, meta.hostSecretHash);
      if (!isHost) {
        ws.send(JSON.stringify({ type: "error", docId, message: "Forbidden" }));
        return;
      }
    }

    this.sql.exec(
      `INSERT INTO doc_meta (doc_id, host_secret_hash, expires_at)
       VALUES (?, ?, ?)
       ON CONFLICT(doc_id) DO UPDATE SET
         host_secret_hash = excluded.host_secret_hash,
         expires_at = excluded.expires_at`,
      docId,
      meta.hostSecretHash,
      expiresAt,
    );

    const attachment = getAttachment(ws);
    if (!attachment.subscriptions.includes(docId)) {
      attachment.subscriptions.push(docId);
    }
    if (isHost && !attachment.hostDocs.includes(docId)) {
      attachment.hostDocs.push(docId);
    }
    setAttachment(ws, attachment);

    ws.send(JSON.stringify({ type: "subscribe:ok", docId }));
    if (isHost) {
      this.sendSnapshot(ws, docId);
    }
  }

  private async verifyHostRole(
    frame: Record<string, unknown>,
    expectedHash: string,
  ): Promise<boolean> {
    if (typeof frame.hostSecret !== "string") {
      return false;
    }
    const hash = await sha256hex(frame.hostSecret);
    return hash === expectedHash;
  }

  private handleUnsubscribe(
    ws: WebSocket,
    frame: Record<string, unknown>,
  ): void {
    if (typeof frame.docId !== "string") {
      return;
    }
    const docId = frame.docId;
    const attachment = getAttachment(ws);
    attachment.subscriptions = attachment.subscriptions.filter(
      (subscriptionId) => subscriptionId !== docId,
    );
    attachment.hostDocs = attachment.hostDocs.filter(
      (hostDocId) => hostDocId !== docId,
    );
    setAttachment(ws, attachment);
  }

  private sendSnapshot(ws: WebSocket, docId: string): void {
    const rows = this.sql.exec(
      `SELECT cmt_id, payload
       FROM comments
       WHERE doc_id = ? AND expires_at > ?
       ORDER BY created_at`,
      docId,
      Date.now(),
    ).toArray();
    const comments = rows.map((row) => ({
      cmtId: String(row.cmt_id),
      payload: String(row.payload),
    }));
    ws.send(JSON.stringify({ type: "comments:snapshot", docId, comments }));
  }

  private handleCommentAdd(
    ws: WebSocket,
    frame: Record<string, unknown>,
  ): void {
    if (
      typeof frame.docId !== "string" ||
      typeof frame.cmtId !== "string" ||
      typeof frame.payload !== "string"
    ) {
      return;
    }

    const docId = frame.docId;
    const cmtId = frame.cmtId;
    const payload = frame.payload;
    const attachment = getAttachment(ws);
    if (!attachment.subscriptions.includes(docId)) {
      ws.send(JSON.stringify({ type: "error", docId, message: "Not subscribed" }));
      return;
    }

    const rows = this.sql.exec(
      "SELECT expires_at FROM doc_meta WHERE doc_id = ?",
      docId,
    ).toArray();
    const expiresAt = Number(rows[0]?.expires_at ?? 0);
    if (expiresAt <= Date.now()) {
      this.clearDoc(docId);
      ws.send(
        JSON.stringify({ type: "error", docId, message: "Share expired or not found" }),
      );
      return;
    }

    const now = Date.now();
    this.sql.exec(
      `INSERT OR IGNORE INTO comments (doc_id, cmt_id, payload, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      docId,
      cmtId,
      payload,
      now,
      expiresAt,
    );

    ws.send(JSON.stringify({ type: "comment:add:ack", docId, cmtId }));
    this.forwardToHostSockets(ws, docId, {
      type: "comment:added",
      docId,
      cmtId,
      payload,
    });
    void this.scheduleNextAlarm();
  }

  private handleCommentResolve(
    ws: WebSocket,
    frame: Record<string, unknown>,
  ): void {
    if (
      typeof frame.docId !== "string" ||
      typeof frame.cmtId !== "string"
    ) {
      return;
    }

    const docId = frame.docId;
    const cmtId = frame.cmtId;
    if (!this.isHostSocketForDoc(ws, docId)) {
      ws.send(JSON.stringify({ type: "error", docId, message: "Forbidden" }));
      return;
    }

    this.sql.exec(
      "DELETE FROM comments WHERE doc_id = ? AND cmt_id = ?",
      docId,
      cmtId,
    );
    ws.send(JSON.stringify({ type: "comment:resolve:ack", docId, cmtId }));
    this.forwardToSubscribers(ws, docId, {
      type: "comment:resolved",
      docId,
      cmtId,
    });
    void this.scheduleNextAlarm();
  }

  private isHostSocketForDoc(ws: WebSocket, docId: string): boolean {
    const attachment = getAttachment(ws);
    return attachment.hostDocs.includes(docId);
  }

  private forwardToHostSockets(
    sender: WebSocket,
    docId: string,
    message: Record<string, unknown>,
  ): void {
    const sockets = this.state.getWebSockets();
    const serialized = JSON.stringify(message);
    for (const peer of sockets) {
      if (peer === sender) {
        continue;
      }
      const attachment = getAttachment(peer);
      if (attachment.hostDocs.includes(docId)) {
        peer.send(serialized);
      }
    }
  }

  private forwardToSubscribers(
    sender: WebSocket,
    docId: string,
    message: Record<string, unknown>,
  ): void {
    const sockets = this.state.getWebSockets();
    const serialized = JSON.stringify(message);
    for (const peer of sockets) {
      if (peer === sender) {
        continue;
      }
      const attachment = getAttachment(peer);
      if (attachment.subscriptions.includes(docId)) {
        peer.send(serialized);
      }
    }
  }

  private async scheduleNextAlarm(): Promise<void> {
    const rows = this.sql.exec(
      "SELECT MIN(expires_at) AS next_expires_at FROM comments",
    ).toArray();
    const nextExpiresAt = Number(rows[0]?.next_expires_at ?? 0);
    if (nextExpiresAt <= 0) {
      await this.state.storage.deleteAlarm();
      return;
    }
    await this.state.storage.setAlarm(nextExpiresAt);
  }

  async alarm(): Promise<void> {
    this.sql.exec("DELETE FROM comments WHERE expires_at <= ?", Date.now());
    await this.scheduleNextAlarm();
  }

  async webSocketClose(): Promise<void> {
    // Attachments are managed by the Hibernation API.
  }

  webSocketError(ws: WebSocket): void {
    ws.close();
  }
}
