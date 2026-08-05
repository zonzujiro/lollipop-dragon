interface RelayEnv {
  LOLLIPOP_DRAGON: KVNamespace;
}

interface RelayShareMeta {
  hostSecretHash: string;
  createdAt: string;
  ttl: number;
}

interface SocketSubscription {
  docId: string;
  role: "host" | "peer";
  subscriptionId?: string;
}

interface SocketAttachment {
  subscriptions: SocketSubscription[];
  writeWindowStartedAt: number;
  writesInWindow: number;
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
  } catch (error) {
    console.warn("[relay-worker] invalid persisted relay metadata:", error);
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

function getStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

const MAX_RELAY_FRAME_BYTES = 1_500_000;
const MAX_ENCRYPTED_COMMENT_BYTES = 1024 * 1024;
const COMMENT_RATE_WINDOW_MS = 60_000;
const MAX_COMMENT_WRITES_PER_WINDOW = 60;
const MAX_IDENTIFIER_LENGTH = 256;
const MAX_PENDING_COMMENTS_PER_DOC = 500;
const MAX_PENDING_PAYLOAD_CHARS_PER_DOC = 8 * 1024 * 1024;
const MAX_SNAPSHOT_CHUNK_BYTES = 1_450_000;
const COMMENT_ID_RE = /^[A-Za-z0-9_-]+$/;

function isValidIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_IDENTIFIER_LENGTH &&
    COMMENT_ID_RE.test(value)
  );
}

function getOptionalSubscriptionId(
  frame: Record<string, unknown>,
): string | undefined {
  const value = frame["subscriptionId"];
  if (!isValidIdentifier(value)) {
    return undefined;
  }
  return value;
}

function hasInvalidSubscriptionId(frame: Record<string, unknown>): boolean {
  return (
    "subscriptionId" in frame && !isValidIdentifier(frame["subscriptionId"])
  );
}

function isSocketSubscription(value: unknown): value is SocketSubscription {
  if (!isRecord(value)) {
    return false;
  }
  const role = value["role"];
  const subscriptionId = value["subscriptionId"];
  return (
    typeof value["docId"] === "string" &&
    (role === "host" || role === "peer") &&
    (subscriptionId === undefined || typeof subscriptionId === "string")
  );
}

function parseSubscriptions(
  record: Record<string, unknown>,
): SocketSubscription[] {
  const value = record["subscriptions"];
  if (Array.isArray(value) && value.every(isSocketSubscription)) {
    return value;
  }

  const legacySubscriptions = getStringArray(record, "subscriptions");
  const legacyHostDocs = new Set(getStringArray(record, "hostDocs"));
  return legacySubscriptions.map((docId) => ({
    docId,
    role: legacyHostDocs.has(docId) ? "host" : "peer",
  }));
}

function getAttachment(ws: WebSocket): SocketAttachment {
  const raw = ws.deserializeAttachment();
  if (isRecord(raw)) {
    return {
      subscriptions: parseSubscriptions(raw),
      writeWindowStartedAt:
        typeof raw["writeWindowStartedAt"] === "number"
          ? raw["writeWindowStartedAt"]
          : Date.now(),
      writesInWindow:
        typeof raw["writesInWindow"] === "number" ? raw["writesInWindow"] : 0,
    };
  }
  return {
    subscriptions: [],
    writeWindowStartedAt: Date.now(),
    writesInWindow: 0,
  };
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
    if (new TextEncoder().encode(text).byteLength > MAX_RELAY_FRAME_BYTES) {
      ws.send(
        JSON.stringify({
          type: "error",
          docId: "",
          message: "Frame too large",
        }),
      );
      return null;
    }
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

function findSubscription(
  attachment: SocketAttachment,
  docId: string,
): SocketSubscription | undefined {
  return attachment.subscriptions.find(
    (subscription) => subscription.docId === docId,
  );
}

function withSubscriptionId(
  message: Record<string, unknown>,
  subscription: SocketSubscription | undefined,
): Record<string, unknown> {
  if (!subscription?.subscriptionId) {
    return message;
  }
  return { ...message, subscriptionId: subscription.subscriptionId };
}

function sendDocFrame(
  ws: WebSocket,
  docId: string,
  message: Record<string, unknown>,
): void {
  const subscription = findSubscription(getAttachment(ws), docId);
  ws.send(JSON.stringify(withSubscriptionId(message, subscription)));
}

function sendRequestFrame(
  ws: WebSocket,
  requestFrame: Record<string, unknown>,
  responseFrame: Record<string, unknown>,
): void {
  const subscriptionId = getOptionalSubscriptionId(requestFrame);
  ws.send(
    JSON.stringify(
      subscriptionId ? { ...responseFrame, subscriptionId } : responseFrame,
    ),
  );
}

function subscriptionMatchesFrame(
  subscription: SocketSubscription | undefined,
  frame: Record<string, unknown>,
): boolean {
  if (!subscription) {
    return false;
  }
  const frameSubscriptionId = getOptionalSubscriptionId(frame);
  return (
    !frameSubscriptionId ||
    !subscription.subscriptionId ||
    frameSubscriptionId === subscription.subscriptionId
  );
}

function consumeCommentWrite(ws: WebSocket): boolean {
  const attachment = getAttachment(ws);
  const now = Date.now();
  if (now - attachment.writeWindowStartedAt >= COMMENT_RATE_WINDOW_MS) {
    attachment.writeWindowStartedAt = now;
    attachment.writesInWindow = 0;
  }
  if (attachment.writesInWindow >= MAX_COMMENT_WRITES_PER_WINDOW) {
    return false;
  }
  attachment.writesInWindow += 1;
  setAttachment(ws, attachment);
  return true;
}

function encryptedPayloadByteLength(payload: string): number {
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
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
      const client = pair[0];
      const server = pair[1];
      this.state.acceptWebSocket(server);
      setAttachment(server, {
        subscriptions: [],
        writeWindowStartedAt: Date.now(),
        writesInWindow: 0,
      });
      return new Response(null, { status: 101, webSocket: client });
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/internal/clear"
    ) {
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
    if (hasInvalidSubscriptionId(frame)) {
      ws.send(
        JSON.stringify({
          type: "error",
          docId: isValidIdentifier(frame.docId) ? frame.docId : "",
          scope: "operation",
          message: "Invalid subscription id",
        }),
      );
      return;
    }
    if (frame.version === 1) {
      this.handleRelayBroadcast(ws, frame);
      return;
    }
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
    if (!isValidIdentifier(frame.docId)) {
      sendRequestFrame(ws, frame, {
        type: "error",
        docId: "",
        message: "Invalid document id",
      });
      return;
    }

    const docId = frame.docId;
    const role = frame.role === "host" ? "host" : "peer";
    const subscriptionId = getOptionalSubscriptionId(frame);
    const metaJson = await this.env.LOLLIPOP_DRAGON.get(`share:${docId}:meta`);
    if (!metaJson) {
      this.clearDoc(docId);
      sendRequestFrame(ws, frame, {
        type: "error",
        docId,
        message: "Doc not found",
      });
      return;
    }

    const meta = parseShareMeta(metaJson);
    if (!meta) {
      sendRequestFrame(ws, frame, {
        type: "error",
        docId,
        message: "Invalid share metadata",
      });
      return;
    }

    const expiresAt = new Date(meta.createdAt).getTime() + meta.ttl * 1000;
    if (expiresAt <= Date.now()) {
      this.clearDoc(docId);
      sendRequestFrame(ws, frame, {
        type: "error",
        docId,
        message: "Share expired",
      });
      return;
    }

    let isHost = false;
    if (role === "host") {
      isHost = await this.verifyHostRole(frame, meta.hostSecretHash);
      if (!isHost) {
        sendRequestFrame(ws, frame, {
          type: "error",
          docId,
          message: "Forbidden",
        });
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
    attachment.subscriptions = attachment.subscriptions.filter(
      (subscription) => subscription.docId !== docId,
    );
    attachment.subscriptions.push({
      docId,
      role: isHost ? "host" : "peer",
      ...(subscriptionId ? { subscriptionId } : {}),
    });
    setAttachment(ws, attachment);

    sendDocFrame(ws, docId, { type: "subscribe:ok", docId });
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
    if (!isValidIdentifier(frame.docId)) {
      return;
    }
    const docId = frame.docId;
    const subscriptionId = getOptionalSubscriptionId(frame);
    const attachment = getAttachment(ws);
    attachment.subscriptions = attachment.subscriptions.filter(
      (subscription) =>
        subscription.docId !== docId ||
        Boolean(
          subscriptionId &&
          subscription.subscriptionId &&
          subscription.subscriptionId !== subscriptionId,
        ),
    );
    setAttachment(ws, attachment);
  }

  private sendSnapshot(ws: WebSocket, docId: string): void {
    const rows = this.sql
      .exec(
        `SELECT cmt_id, payload
       FROM comments
       WHERE doc_id = ? AND expires_at > ?
       ORDER BY created_at`,
        docId,
        Date.now(),
      )
      .toArray();
    const comments = rows.map((row) => ({
      cmtId: String(row.cmt_id),
      payload: String(row.payload),
    }));
    const subscription = findSubscription(getAttachment(ws), docId);
    if (!subscription?.subscriptionId) {
      sendDocFrame(ws, docId, {
        type: "comments:snapshot",
        docId,
        comments,
      });
      return;
    }
    const chunks: Array<typeof comments> = [];
    let currentChunk: typeof comments = [];
    for (const comment of comments) {
      const candidate = [...currentChunk, comment];
      const candidateBytes = new TextEncoder().encode(
        JSON.stringify({
          type: "comments:snapshot",
          docId,
          comments: candidate,
          subscriptionId: subscription.subscriptionId,
        }),
      ).byteLength;
      if (
        candidateBytes > MAX_SNAPSHOT_CHUNK_BYTES &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk);
        currentChunk = [comment];
      } else {
        currentChunk = candidate;
      }
    }
    chunks.push(currentChunk);
    const snapshotId = crypto.randomUUID();
    for (const [chunkIndex, chunk] of chunks.entries()) {
      sendDocFrame(ws, docId, {
        type: "comments:snapshot",
        docId,
        comments: chunk,
        snapshotId,
        chunkIndex,
        chunkCount: chunks.length,
      });
    }
  }

  private handleCommentAdd(
    ws: WebSocket,
    frame: Record<string, unknown>,
  ): void {
    if (
      !isValidIdentifier(frame.docId) ||
      typeof frame.cmtId !== "string" ||
      typeof frame.payload !== "string"
    ) {
      return;
    }
    if (!isValidIdentifier(frame.cmtId)) {
      sendDocFrame(ws, frame.docId, {
        type: "error",
        docId: frame.docId,
        cmtId: frame.cmtId,
        scope: "operation",
        message: "Invalid comment id",
      });
      return;
    }

    const docId = frame.docId;
    const cmtId = frame.cmtId;
    const payload = frame.payload;
    const attachment = getAttachment(ws);
    const subscription = findSubscription(attachment, docId);
    const frameSubscriptionId = getOptionalSubscriptionId(frame);
    if (
      frameSubscriptionId &&
      subscription?.subscriptionId &&
      frameSubscriptionId !== subscription.subscriptionId
    ) {
      sendRequestFrame(ws, frame, {
        type: "error",
        docId,
        cmtId,
        scope: "operation",
        message: "Stale subscription generation",
      });
      return;
    }
    if (
      !subscriptionMatchesFrame(subscription, frame) ||
      subscription?.role !== "peer"
    ) {
      ws.send(
        JSON.stringify(
          withSubscriptionId(
            { type: "error", docId, message: "Not subscribed as peer" },
            subscription,
          ),
        ),
      );
      return;
    }
    if (encryptedPayloadByteLength(payload) > MAX_ENCRYPTED_COMMENT_BYTES) {
      sendDocFrame(ws, docId, {
        type: "error",
        docId,
        cmtId,
        scope: "operation",
        message: "Comment payload too large",
      });
      return;
    }
    const existingRows = this.sql
      .exec(
        "SELECT 1 AS found FROM comments WHERE doc_id = ? AND cmt_id = ? LIMIT 1",
        docId,
        cmtId,
      )
      .toArray();
    if (existingRows.length > 0) {
      sendDocFrame(ws, docId, { type: "comment:add:ack", docId, cmtId });
      return;
    }
    const usageRows = this.sql
      .exec(
        `SELECT COUNT(*) AS comment_count,
                COALESCE(SUM(LENGTH(payload)), 0) AS payload_chars
         FROM comments
         WHERE doc_id = ?`,
        docId,
      )
      .toArray();
    const commentCount = Number(usageRows[0]?.comment_count ?? 0);
    const payloadChars = Number(usageRows[0]?.payload_chars ?? 0);
    if (
      commentCount >= MAX_PENDING_COMMENTS_PER_DOC ||
      payloadChars + payload.length > MAX_PENDING_PAYLOAD_CHARS_PER_DOC
    ) {
      sendDocFrame(ws, docId, {
        type: "error",
        docId,
        cmtId,
        scope: "operation",
        message: "Review inbox capacity exceeded",
      });
      return;
    }
    if (!consumeCommentWrite(ws)) {
      sendDocFrame(ws, docId, {
        type: "error",
        docId,
        cmtId,
        scope: "operation",
        message: "Comment rate limit exceeded",
      });
      return;
    }

    const rows = this.sql
      .exec("SELECT expires_at FROM doc_meta WHERE doc_id = ?", docId)
      .toArray();
    const expiresAt = Number(rows[0]?.expires_at ?? 0);
    if (expiresAt <= Date.now()) {
      this.clearDoc(docId);
      ws.send(
        JSON.stringify({
          type: "error",
          docId,
          message: "Share expired or not found",
        }),
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

    sendDocFrame(ws, docId, { type: "comment:add:ack", docId, cmtId });
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
    if (!isValidIdentifier(frame.docId) || typeof frame.cmtId !== "string") {
      return;
    }
    if (!isValidIdentifier(frame.cmtId)) {
      sendDocFrame(ws, frame.docId, {
        type: "error",
        docId: frame.docId,
        cmtId: frame.cmtId,
        scope: "operation",
        message: "Invalid comment id",
      });
      return;
    }

    const docId = frame.docId;
    const cmtId = frame.cmtId;
    const subscription = findSubscription(getAttachment(ws), docId);
    const frameSubscriptionId = getOptionalSubscriptionId(frame);
    if (
      frameSubscriptionId &&
      subscription?.subscriptionId &&
      frameSubscriptionId !== subscription.subscriptionId
    ) {
      sendRequestFrame(ws, frame, {
        type: "error",
        docId,
        cmtId,
        scope: "operation",
        message: "Stale subscription generation",
      });
      return;
    }
    if (
      !subscriptionMatchesFrame(subscription, frame) ||
      subscription?.role !== "host"
    ) {
      ws.send(
        JSON.stringify(
          withSubscriptionId(
            { type: "error", docId, message: "Forbidden" },
            subscription,
          ),
        ),
      );
      return;
    }

    this.sql.exec(
      "DELETE FROM comments WHERE doc_id = ? AND cmt_id = ?",
      docId,
      cmtId,
    );
    sendDocFrame(ws, docId, {
      type: "comment:resolve:ack",
      docId,
      cmtId,
    });
    this.forwardToSubscribers(ws, docId, {
      type: "comment:resolved",
      docId,
      cmtId,
    });
    void this.scheduleNextAlarm();
  }

  private handleRelayBroadcast(
    ws: WebSocket,
    frame: Record<string, unknown>,
  ): void {
    if (!isValidIdentifier(frame.docId) || typeof frame.payload !== "string") {
      return;
    }
    const docId = frame.docId;
    const subscription = findSubscription(getAttachment(ws), docId);
    const frameSubscriptionId = getOptionalSubscriptionId(frame);
    if (
      frameSubscriptionId &&
      subscription?.subscriptionId &&
      frameSubscriptionId !== subscription.subscriptionId
    ) {
      return;
    }
    if (
      !subscriptionMatchesFrame(subscription, frame) ||
      subscription?.role !== "host"
    ) {
      sendDocFrame(ws, docId, {
        type: "error",
        docId,
        message: "Forbidden",
      });
      return;
    }
    this.forwardToSubscribers(ws, docId, {
      version: 1,
      docId,
      payload: frame.payload,
    });
  }

  private forwardToHostSockets(
    sender: WebSocket,
    docId: string,
    message: Record<string, unknown>,
  ): void {
    const sockets = this.state.getWebSockets();
    for (const peer of sockets) {
      if (peer === sender) {
        continue;
      }
      const attachment = getAttachment(peer);
      const subscription = findSubscription(attachment, docId);
      if (subscription?.role === "host") {
        peer.send(JSON.stringify(withSubscriptionId(message, subscription)));
      }
    }
  }

  private forwardToSubscribers(
    sender: WebSocket,
    docId: string,
    message: Record<string, unknown>,
  ): void {
    const sockets = this.state.getWebSockets();
    for (const peer of sockets) {
      if (peer === sender) {
        continue;
      }
      const attachment = getAttachment(peer);
      const subscription = findSubscription(attachment, docId);
      if (subscription) {
        peer.send(JSON.stringify(withSubscriptionId(message, subscription)));
      }
    }
  }

  private async scheduleNextAlarm(): Promise<void> {
    const rows = this.sql
      .exec("SELECT MIN(expires_at) AS next_expires_at FROM comments")
      .toArray();
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
