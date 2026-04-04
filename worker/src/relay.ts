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
  if (raw && Array.isArray(raw.subscriptions)) {
    return { subscriptions: raw.subscriptions };
  }
  return { subscriptions: [] };
}

function setAttachment(ws: WebSocket, attachment: SocketAttachment): void {
  ws.serializeAttachment(attachment);
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
    console.error("[RelayHub] invalid JSON from client:", parseError);
    ws.send(
      JSON.stringify({ type: "error", docId: "", message: "Invalid JSON" }),
    );
    return null;
  }

  if (!isRecord(data)) {
    return null;
  }
  return data;
}

export class RelayHub implements DurableObject {
  private frameHandlers: Record<
    string,
    (ws: WebSocket, frame: Record<string, unknown>) => Promise<void> | void
  > = {
    ping: (ws) => ws.send(JSON.stringify({ type: "pong" })),
    subscribe: (ws, frame) => this.handleSubscribe(ws, frame),
    unsubscribe: (ws, frame) => this.handleUnsubscribe(ws, frame),
  };

  constructor(
    private state: DurableObjectState,
    private env: RelayEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
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
    const frame = parseMessage(ws, message);
    if (!frame) {
      return;
    }

    const frameType = typeof frame.type === "string" ? frame.type : "";
    const handler = this.frameHandlers[frameType];
    if (handler) {
      await handler(ws, frame);
      return;
    }

    this.handleRelayFrame(ws, frame);
  }

  private async handleSubscribe(
    ws: WebSocket,
    frame: Record<string, unknown>,
  ): Promise<void> {
    if (typeof frame.docId !== "string") {
      return;
    }
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
  }

  private handleUnsubscribe(
    ws: WebSocket,
    frame: Record<string, unknown>,
  ): void {
    if (typeof frame.docId !== "string") {
      return;
    }
    const attachment = getAttachment(ws);
    attachment.subscriptions = attachment.subscriptions.filter(
      (subscriptionId) => subscriptionId !== frame.docId,
    );
    setAttachment(ws, attachment);
  }

  private handleRelayFrame(
    ws: WebSocket,
    frame: Record<string, unknown>,
  ): void {
    if (
      frame.version !== 1 ||
      typeof frame.docId !== "string" ||
      typeof frame.payload !== "string"
    ) {
      return;
    }

    const senderAttachment = getAttachment(ws);
    if (!senderAttachment.subscriptions.includes(frame.docId)) {
      return;
    }

    const allSockets = this.state.getWebSockets();
    const serialized = JSON.stringify(frame);
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
