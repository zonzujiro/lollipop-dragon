import { encrypt, decrypt } from "./crypto";
import type { RelayMessage } from "../types/relay";
import { WORKER_URL } from "../config";

export interface RelayConnection {
  subscribe(docId: string, key: CryptoKey): void;
  unsubscribe(docId: string): void;
  send(docId: string, message: RelayMessage): Promise<void>;
  close(): void;
}

const VALID_RELAY_TYPES = new Set([
  "comment:added",
  "comment:resolved",
  "document:updated",
]);

function isValidRelayMessage(value: unknown): value is RelayMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return "type" in value && typeof value.type === "string" && VALID_RELAY_TYPES.has(value.type);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isControlFrame(frame: Record<string, unknown>): boolean {
  return frame.type === "pong" || frame.type === "error" || frame.type === "subscribe:ok";
}

function handleControlFrame(
  frame: Record<string, unknown>,
  confirmedSubscriptions: Set<string>,
  onSubscribeResult: (docId: string, ok: boolean) => void,
  activeSubscriptions: Set<string>,
  socket: WebSocket | null,
): boolean {
  if (frame.type === "pong") {
    return true;
  }

  if (frame.type === "error" && typeof frame.docId === "string") {
    console.warn("[relay] server error for docId", frame.docId, ":", frame.message);
    onSubscribeResult(frame.docId, false);
    if (activeSubscriptions.has(frame.docId)) {
      setTimeout(() => {
        if (socket && socket.readyState === WebSocket.OPEN && activeSubscriptions.has(frame.docId)) {
          socket.send(JSON.stringify({ type: "subscribe", docId: frame.docId }));
        }
      }, 5000);
    }
    return true;
  }

  if (frame.type === "subscribe:ok" && typeof frame.docId === "string") {
    confirmedSubscriptions.add(frame.docId);
    onSubscribeResult(frame.docId, true);
    return true;
  }

  return false;
}

async function decryptAndDispatch(
  frame: Record<string, unknown>,
  encryptionKeys: Map<string, CryptoKey>,
  onMessage: (docId: string, message: RelayMessage) => void,
): Promise<void> {
  if (!frame.payload || !frame.docId || typeof frame.payload !== "string" || typeof frame.docId !== "string") {
    return;
  }

  const key = encryptionKeys.get(frame.docId);
  if (!key) {
    return;
  }

  const raw = Uint8Array.from(atob(frame.payload), (char) => char.charCodeAt(0));
  const decrypted = await decrypt(raw.buffer, key);
  const parsed: unknown = JSON.parse(new TextDecoder().decode(decrypted));
  if (!isValidRelayMessage(parsed)) {
    console.warn("[relay] invalid message shape, discarding");
    return;
  }
  onMessage(frame.docId, parsed);
}

/** Convert an ArrayBuffer to a base64 string without hitting stack size limits. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function connectRelay(
  onMessage: (docId: string, message: RelayMessage) => void,
  onStatusChange: (status: "connecting" | "connected" | "disconnected") => void,
  onSubscribeResult: (docId: string, ok: boolean) => void,
): RelayConnection {
  if (!WORKER_URL) {
    throw new Error("Worker URL not configured");
  }

  const wsUrl = WORKER_URL.replace(/^http/, "ws") + "/relay";
  const encryptionKeys = new Map<string, CryptoKey>(); // docId → encryption key
  const activeSubscriptions = new Set<string>();        // docIds to subscribe on (re)connect
  const confirmedSubscriptions = new Set<string>();     // docIds confirmed by DO
  let socket: WebSocket | null = null;
  let backoff = 1000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let closedIntentionally = false;

  // --- Debouncing ---
  let outboundBatch: Array<{ version: 1; docId: string; payload: string }> = [];
  let batchTimer: ReturnType<typeof setTimeout> | null = null;
  const BATCH_INTERVAL_MS = 500;
  const PING_INTERVAL_MS = 30_000;

  function flushBatch(): void {
    batchTimer = null; // Always clear the timer reference first
    if (outboundBatch.length === 0 || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    for (const frame of outboundBatch) {
      socket.send(JSON.stringify(frame));
    }
    outboundBatch = [];
  }

  function startPingInterval(): void {
    stopPingInterval();
    pingInterval = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "ping" }));
      }
    }, PING_INTERVAL_MS);
  }

  function stopPingInterval(): void {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  }

  function openConnection(): void {
    onStatusChange("connecting");
    socket = new WebSocket(wsUrl);

    socket.addEventListener("open", () => {
      if (closedIntentionally) {
        socket?.close();
        return;
      }
      backoff = 1000;
      onStatusChange("connected");
      startPingInterval();
      // Re-subscribe to all active docIds
      for (const docId of activeSubscriptions) {
        if (socket) {
          socket.send(JSON.stringify({ type: "subscribe", docId }));
        }
      }
      // Flush any messages that were queued while disconnected
      flushBatch();
    });

    socket.addEventListener("message", async (event) => {
      try {
        const frame = JSON.parse(typeof event.data === "string" ? event.data : "");
        if (!isRecord(frame)) {
          return;
        }
        if (handleControlFrame(frame, confirmedSubscriptions, onSubscribeResult, activeSubscriptions, socket)) {
          return;
        }
        await decryptAndDispatch(frame, encryptionKeys, onMessage);
      } catch (error) {
        console.warn("[relay] failed to process message:", error);
      }
    });

    socket.addEventListener("close", () => {
      stopPingInterval();
      onStatusChange("disconnected");
      if (!closedIntentionally) {
        scheduleReconnect();
      }
    });

    socket.addEventListener("error", () => {
      socket?.close();
    });
  }

  function scheduleReconnect(): void {
    if (reconnectTimer) {
      return;
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      backoff = Math.min(backoff * 2, 30000);
      openConnection();
    }, backoff);
  }

  openConnection();

  return {
    subscribe(docId: string, key: CryptoKey) {
      // Always add to activeSubscriptions first — if the socket is closed,
      // the openConnection() handler will send all activeSubscriptions
      // on the next successful (re)connect.
      // The subscription is not considered confirmed until the DO sends
      // back a subscribe:ok frame, which adds it to confirmedSubscriptions.
      encryptionKeys.set(docId, key);
      activeSubscriptions.add(docId);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "subscribe", docId }));
      }
    },

    unsubscribe(docId: string) {
      // Send to DO first (if connected), then remove from local tracking.
      // This ordering matters: if the socket is closed, the unsubscribe
      // frame is lost — but removing from activeSubscriptions ensures
      // the reconnect loop won't re-subscribe to this docId.
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "unsubscribe", docId }));
      }
      encryptionKeys.delete(docId);
      activeSubscriptions.delete(docId);
      confirmedSubscriptions.delete(docId);
    },

    async send(docId: string, message: RelayMessage) {
      const key = encryptionKeys.get(docId);
      if (!key) {
        throw new Error(`No encryption key for docId: ${docId}`);
      }
      const encoded = new TextEncoder().encode(JSON.stringify(message));
      const encrypted = await encrypt(encoded, key);
      const payload = arrayBufferToBase64(encrypted);
      outboundBatch.push({ version: 1, docId, payload });
      if (!batchTimer) {
        batchTimer = setTimeout(flushBatch, BATCH_INTERVAL_MS);
      }
    },

    close() {
      // Mark as intentional so the close event handler does not reconnect
      closedIntentionally = true;
      // Flush any pending outbound messages before tearing down
      flushBatch();

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (batchTimer) {
        clearTimeout(batchTimer);
      }
      stopPingInterval();
      socket?.close();
      socket = null;
      encryptionKeys.clear();
      activeSubscriptions.clear();
      confirmedSubscriptions.clear();
    },
  };
}
