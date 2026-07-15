/**
 * Minimal Cloudflare runtime surface used by this worker. Regenerate this file
 * with `npm run types` inside `worker/` after changing Wrangler bindings.
 */

interface KVNamespacePutOptions {
  expirationTtl?: number;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  put(
    key: string,
    value: string | ArrayBuffer,
    options?: KVNamespacePutOptions,
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

interface DurableObjectId {
  readonly durableObjectIdBrand?: never;
}

interface DurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface SqlStorageCursor<Row extends Record<string, unknown>> {
  toArray(): Row[];
}

interface SqlStorage {
  exec<Row extends Record<string, unknown> = Record<string, unknown>>(
    query: string,
    ...bindings: unknown[]
  ): SqlStorageCursor<Row>;
}

interface DurableObjectStorage {
  sql: SqlStorage;
  deleteAlarm(): Promise<void>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
  acceptWebSocket(socket: WebSocket): void;
  getWebSockets(): WebSocket[];
}

interface DurableObject {
  fetch(request: Request): Promise<Response>;
}

interface WebSocket {
  deserializeAttachment(): unknown;
  serializeAttachment(value: unknown): void;
}

interface WebSocketPairValue {
  0: WebSocket;
  1: WebSocket;
}

declare const WebSocketPair: {
  new (): WebSocketPairValue;
};

interface ResponseInit {
  webSocket?: WebSocket;
}
