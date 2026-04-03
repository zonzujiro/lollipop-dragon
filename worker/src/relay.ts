interface RelayEnv {
  LOLLIPOP_DRAGON: KVNamespace;
}

interface SocketAttachment {
  subscriptions: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getAttachment(ws: WebSocket): SocketAttachment {
  const raw = ws.deserializeAttachment();
  if (isRecord(raw) && Array.isArray(raw.subscriptions)) {
    return { subscriptions: raw.subscriptions as string[] };
  }
  return { subscriptions: [] };
}

function setAttachment(ws: WebSocket, attachment: SocketAttachment): void {
  ws.serializeAttachment(attachment);
}

export class RelayHub implements DurableObject {
  constructor(
    private state: DurableObjectState,
    private env: RelayEnv,
  ) {}

  async fetch(_request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    setAttachment(server, { subscriptions: [] });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    let data: unknown;
    try {
      const text =
        typeof message === "string"
          ? message
          : new TextDecoder().decode(message);
      data = JSON.parse(text);
    } catch (parseError) {
      console.error("[RelayHub] invalid JSON from client:", parseError);
      ws.send(JSON.stringify({ type: "error", docId: "", message: "Invalid JSON" }));
      return;
    }

    if (!isRecord(data)) {
      return;
    }
    const frame = data;

    if (frame.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
      return;
    }

    if (frame.type === "subscribe" && typeof frame.docId === "string") {
      const meta = await this.env.LOLLIPOP_DRAGON.get(
        `share:${frame.docId}:meta`,
      );
      if (!meta) {
        ws.send(
          JSON.stringify({
            type: "error",
            docId: frame.docId,
            message: "Doc not found",
          }),
        );
        return;
      }
      const attachment = getAttachment(ws);
      if (!attachment.subscriptions.includes(frame.docId)) {
        attachment.subscriptions.push(frame.docId);
        setAttachment(ws, attachment);
      }
      ws.send(JSON.stringify({ type: "subscribe:ok", docId: frame.docId }));
      return;
    }

    if (frame.type === "unsubscribe" && typeof frame.docId === "string") {
      const attachment = getAttachment(ws);
      attachment.subscriptions = attachment.subscriptions.filter(
        (docId: string) => docId !== frame.docId,
      );
      setAttachment(ws, attachment);
      return;
    }

    // Relay frame validation
    if (
      frame.version !== 1 ||
      typeof frame.docId !== "string" ||
      typeof frame.payload !== "string"
    ) {
      return;
    }

    // Forward to all OTHER connections subscribed to frame.docId
    const allSockets = this.state.getWebSockets();
    const serialized = JSON.stringify(data);
    for (const peer of allSockets) {
      if (peer === ws) {
        continue;
      }
      const peerAttachment = getAttachment(peer);
      if (peerAttachment.subscriptions.includes(frame.docId)) {
        peer.send(serialized);
      }
    }
  }

  async webSocketClose(): Promise<void> {
    // No manual cleanup needed — Hibernation API discards attachments automatically
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    ws.close();
  }
}
