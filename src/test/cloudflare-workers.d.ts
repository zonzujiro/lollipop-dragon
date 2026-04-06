interface SqlStorageCursor {
  toArray(): Array<Record<string, unknown>>;
}

interface SqlStorage {
  exec(query: string, ...params: Array<string | number>): SqlStorageCursor;
}

interface AlarmStorage {
  sql: SqlStorage;
  setAlarm(scheduledTime: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

interface DurableObjectState {
  storage: AlarmStorage;
  acceptWebSocket(socket: WebSocket): void;
  getWebSockets(): WebSocket[];
}

interface DurableObject {}

interface KVNamespace {
  get(key: string): Promise<string | null>;
}

declare class WebSocketPair {
  [index: number]: WebSocket;
}

interface ResponseInit {
  webSocket?: WebSocket;
}

interface WebSocket {
  serializeAttachment(data: unknown): void;
  deserializeAttachment(): unknown;
}
