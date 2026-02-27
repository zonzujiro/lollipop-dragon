// Real-time collaboration service using Trystero (BitTorrent signaling) + Yjs (CRDT sync).
//
// Trystero handles WebRTC room management and peer discovery.
// Yjs handles conflict-free comment synchronization.
// This module bridges the two: Trystero rooms transport Yjs sync messages.

import {
  joinRoom as trysteroJoinRoom,
  getRelaySockets,
  selfId,
} from "trystero/torrent";
import type { Room } from "trystero";
import * as Y from "yjs";
import type { PeerComment } from "../types/share";
import type { CommentType } from "../types/criticmarkup";

// ── Types ────────────────────────────────────────────────────────────────────

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface PeerInfo {
  peerId: string;
  name: string;
  activeFile: string | null;
  focusedBlock: number | null;
}

export interface RealtimeCallbacks {
  onConnectionChange: (status: ConnectionStatus, peers: PeerInfo[]) => void;
  onRemoteComment: (comment: PeerComment) => void;
  onCommentRemoved: (commentId: string) => void;
  onDocumentUpdated: () => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const APP_ID = "lollipop-dragon";
const RECONNECT_DELAY_MS = 3000;
const AWARENESS_INTERVAL_MS = 5000;
const MAX_RETRIES = 3;

const log = (...args: unknown[]) => console.log("[rt]", ...args);

// Use all 4 default Trystero torrent trackers for better peer discovery
const TRACKER_URLS = [
  "wss://tracker.webtorrent.dev",
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.btorrent.xyz",
  "wss://tracker.files.fm:7073/announce",
];

// TURN servers for NAT traversal — passed via turnConfig so they're
// appended to Trystero's default STUN servers instead of replacing them
const TURN_SERVERS: RTCIceServer[] = [
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

// ── RealtimeSession ──────────────────────────────────────────────────────────

export class RealtimeSession {
  private room: Room | null = null;
  private ydoc: Y.Doc;
  private commentsMap: Y.Map<Record<string, unknown>>;
  private awarenessState: Map<string, PeerInfo> = new Map();
  private callbacks: RealtimeCallbacks;
  private roomId: string;
  private roomPassword: string;
  private localName: string;
  private localActiveFile: string | null = null;
  private localFocusedBlock: number | null = null;
  private destroyed = false;
  private retryCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private awarenessTimer: ReturnType<typeof setInterval> | null = null;

  // Trystero action senders (set after joining)
  private sendYjsSync: ((data: Uint8Array) => Promise<void[]>) | null = null;
  private sendYjsUpdate: ((data: Uint8Array) => Promise<void[]>) | null = null;
  private sendAwareness:
    | ((data: Record<string, unknown>) => Promise<void[]>)
    | null = null;
  private sendContentUpdated: ((data: string) => Promise<void[]>) | null = null;

  // Track applied remote updates to avoid echo
  private appliedRemoteUpdates = new WeakSet<Uint8Array>();

  constructor(
    roomId: string,
    roomPassword: string,
    localName: string,
    callbacks: RealtimeCallbacks,
  ) {
    this.roomId = roomId;
    this.roomPassword = roomPassword;
    this.localName = localName;
    this.callbacks = callbacks;

    // Initialize Yjs doc with a shared comments map
    this.ydoc = new Y.Doc();
    this.commentsMap = this.ydoc.getMap("comments");

    // Listen for remote changes to the comments map
    this.commentsMap.observe((event) => {
      for (const [key, change] of event.changes.keys) {
        if (change.action === "add" || change.action === "update") {
          const raw = this.commentsMap.get(key);
          if (raw) {
            const comment = this.mapEntryToComment(key, raw);
            if (comment) this.callbacks.onRemoteComment(comment);
          }
        } else if (change.action === "delete") {
          this.callbacks.onCommentRemoved(key);
        }
      }
    });

    // Listen for Yjs doc updates to broadcast via Trystero
    this.ydoc.on("update", (update: Uint8Array, origin: unknown) => {
      // Only broadcast updates that originated locally
      if (origin !== "remote" && this.sendYjsUpdate) {
        this.sendYjsUpdate(update).catch(() => {});
      }
    });
  }

  // ── Public API ───────────────────────────────────────────────────────────

  connect(): void {
    if (this.destroyed) return;
    log("connect() called, roomId=", this.roomId);
    this.callbacks.onConnectionChange("connecting", this.getPeers());
    this.joinTrysteroRoom();
  }

  disconnect(): void {
    log("disconnect() called");
    this.destroyed = true;
    this.cleanup();
    this.callbacks.onConnectionChange("disconnected", []);
  }

  /** Add a comment to the shared Yjs doc (from local peer) */
  addComment(comment: PeerComment): void {
    log("addComment()", comment.id, "by", comment.peerName);
    this.ydoc.transact(() => {
      this.commentsMap.set(comment.id, {
        peerName: comment.peerName,
        path: comment.path,
        blockIndex: comment.blockRef.blockIndex,
        contentPreview: comment.blockRef.contentPreview,
        commentType: comment.commentType,
        text: comment.text,
        createdAt: comment.createdAt,
      });
    });
  }

  /** Remove a comment from the shared Yjs doc (host addressed it) */
  removeComment(commentId: string): void {
    this.ydoc.transact(() => {
      this.commentsMap.delete(commentId);
    });
  }

  /** Seed comments already known (from Worker) to avoid duplicates */
  seedComments(comments: PeerComment[]): void {
    this.ydoc.transact(() => {
      for (const c of comments) {
        if (!this.commentsMap.has(c.id)) {
          this.commentsMap.set(c.id, {
            peerName: c.peerName,
            path: c.path,
            blockIndex: c.blockRef.blockIndex,
            contentPreview: c.blockRef.contentPreview,
            commentType: c.commentType,
            text: c.text,
            createdAt: c.createdAt,
          });
        }
      }
    });
  }

  /** Get all comments currently in the Yjs doc */
  getComments(): PeerComment[] {
    const result: PeerComment[] = [];
    this.commentsMap.forEach((value, key) => {
      const c = this.mapEntryToComment(key, value);
      if (c) result.push(c);
    });
    return result;
  }

  /** Update local awareness (active file, focused block) */
  setLocalAwareness(
    activeFile: string | null,
    focusedBlock: number | null,
  ): void {
    this.localActiveFile = activeFile;
    this.localFocusedBlock = focusedBlock;
    this.broadcastAwareness();
  }

  /** Notify connected peers that the host has updated the shared content */
  notifyContentUpdated(): void {
    if (this.sendContentUpdated) {
      this.sendContentUpdated("updated").catch(() => {});
    }
  }

  getPeers(): PeerInfo[] {
    return Array.from(this.awarenessState.values());
  }

  get selfPeerId(): string {
    return selfId;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private joinTrysteroRoom(): void {
    log("joinTrysteroRoom() roomId=", this.roomId, "trackers=", TRACKER_URLS);
    try {
      this.room = trysteroJoinRoom(
        {
          appId: APP_ID,
          password: this.roomPassword,
          relayUrls: TRACKER_URLS,
          turnConfig: TURN_SERVERS,
        },
        this.roomId,
      );
      log("trysteroJoinRoom() succeeded, room created");

      // Log tracker WebSocket states
      try {
        const sockets = getRelaySockets();
        for (const [url, socketOrPromise] of Object.entries(sockets)) {
          const attach = (socket: WebSocket) => {
            log("tracker socket:", url, "readyState=", socket.readyState);
            const origOnMessage = socket.onmessage;
            socket.onmessage = (ev) => {
              try {
                const data = JSON.parse(ev.data as string);
                if (data.offer) {
                  log("tracker RECV offer from", data.peer_id, "via", url);
                } else if (data.answer) {
                  log("tracker RECV answer from", data.peer_id, "via", url);
                } else if (data["failure reason"]) {
                  log("tracker FAILURE:", data["failure reason"], "from", url);
                }
              } catch {
                /* binary or non-json */
              }
              if (origOnMessage) origOnMessage.call(socket, ev);
            };
            socket.onclose = () => log("tracker socket CLOSED:", url);
            socket.onerror = (e) => log("tracker socket ERROR:", url, e);
          };
          if (socketOrPromise && typeof (socketOrPromise as Promise<WebSocket>).then === "function") {
            (socketOrPromise as Promise<WebSocket>).then(attach);
          } else {
            attach(socketOrPromise as WebSocket);
          }
        }
      } catch (e) {
        log("getRelaySockets() failed:", e);
      }
    } catch (err) {
      log("trysteroJoinRoom() FAILED:", err);
      this.scheduleReconnect();
      return;
    }

    try {
      // ── Yjs sync actions ──

      const [sendSync, onSync] = this.room.makeAction<Uint8Array>("yjs-sync");
      const [sendUpdate, onUpdate] =
        this.room.makeAction<Uint8Array>("yjs-update");
      const [sendAwareness, onAwareness] =
        this.room.makeAction<Record<string, unknown>>("awareness");
      const [sendContentUpdated, onContentUpdated] =
        this.room.makeAction<string>("doc-updated");

      this.sendYjsSync = sendSync;
      this.sendYjsUpdate = sendUpdate;
      this.sendAwareness = sendAwareness;
      this.sendContentUpdated = sendContentUpdated;

      // When receiving a Yjs sync message, apply it to local doc
      onSync((data: Uint8Array, peerId: string) => {
        log("recv yjs-sync from", peerId, "bytes=", data.byteLength);
        try {
          Y.applyUpdate(this.ydoc, data, "remote");
        } catch (err) {
          log("yjs-sync apply FAILED:", err);
        }
      });

      // When receiving a Yjs incremental update
      onUpdate((data: Uint8Array, peerId: string) => {
        log("recv yjs-update from", peerId, "bytes=", data.byteLength);
        try {
          Y.applyUpdate(this.ydoc, data, "remote");
        } catch (err) {
          log("yjs-update apply FAILED:", err);
        }
      });

      // When receiving awareness update from a peer
      onAwareness((data: Record<string, unknown>, peerId: string) => {
        log("recv awareness from", peerId, "data=", data);
        this.awarenessState.set(peerId, {
          peerId,
          name: (data.name as string) ?? "Anonymous",
          activeFile: (data.activeFile as string | null) ?? null,
          focusedBlock: (data.focusedBlock as number | null) ?? null,
        });
        this.callbacks.onConnectionChange("connected", this.getPeers());
      });

      // When a peer notifies the content was updated
      onContentUpdated((_data: string, peerId: string) => {
        log("recv doc-updated from", peerId);
        this.callbacks.onDocumentUpdated();
      });

      // ── Peer lifecycle ──

      this.room.onPeerJoin((peerId: string) => {
        log("PEER JOINED:", peerId);
        this.retryCount = 0;
        // Send our full Yjs state to the new peer
        const stateVector = Y.encodeStateAsUpdate(this.ydoc);
        log("sending yjs state to new peer, bytes=", stateVector.byteLength);
        sendSync(stateVector, peerId).catch((err) => {
          log("sendSync to", peerId, "FAILED:", err);
        });
        // Send our awareness
        this.broadcastAwareness();
        this.callbacks.onConnectionChange("connected", this.getPeers());
      });

      this.room.onPeerLeave((peerId: string) => {
        log("PEER LEFT:", peerId);
        this.awarenessState.delete(peerId);
        const peers = this.getPeers();
        this.callbacks.onConnectionChange(
          peers.length > 0 ? "connected" : "connecting",
          peers,
        );
      });

      // Broadcast awareness immediately so existing peers discover us
      this.broadcastAwareness();

      // Start periodic awareness broadcast
      this.awarenessTimer = setInterval(() => {
        this.broadcastAwareness();
      }, AWARENESS_INTERVAL_MS);

      // We're now "connecting" — status upgrades to "connected" when a peer joins
      log("room set up, waiting for peers…");
      this.callbacks.onConnectionChange("connecting", []);
    } catch (err) {
      log("room setup FAILED:", err);
      this.cleanup();
      this.callbacks.onConnectionChange("error", []);
    }
  }

  private broadcastAwareness(): void {
    if (!this.sendAwareness) return;
    this.sendAwareness({
      name: this.localName,
      activeFile: this.localActiveFile,
      focusedBlock: this.localFocusedBlock,
    }).catch(() => {});
  }

  private mapEntryToComment(
    id: string,
    raw: Record<string, unknown>,
  ): PeerComment | null {
    if (!raw.peerName || !raw.path) return null;
    return {
      id,
      peerName: raw.peerName as string,
      path: raw.path as string,
      blockRef: {
        blockIndex: (raw.blockIndex as number) ?? 0,
        contentPreview: (raw.contentPreview as string) ?? "",
      },
      commentType: (raw.commentType as CommentType) ?? "note",
      text: (raw.text as string) ?? "",
      createdAt: (raw.createdAt as string) ?? new Date().toISOString(),
    };
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    this.retryCount++;
    log("scheduleReconnect() attempt", this.retryCount, "/", MAX_RETRIES);
    if (this.retryCount >= MAX_RETRIES) {
      log("giving up after", MAX_RETRIES, "attempts");
      this.callbacks.onConnectionChange("error", []);
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      if (!this.destroyed) this.joinTrysteroRoom();
    }, RECONNECT_DELAY_MS);
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.awarenessTimer) {
      clearInterval(this.awarenessTimer);
      this.awarenessTimer = null;
    }
    if (this.room) {
      this.room.leave().catch(() => {});
      this.room = null;
    }
    this.sendYjsSync = null;
    this.sendYjsUpdate = null;
    this.sendAwareness = null;
    this.sendContentUpdated = null;
    this.awarenessState.clear();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a room ID from a doc ID (deterministic) */
export function docIdToRoomId(docId: string): string {
  return `mr-${docId.slice(0, 16)}`;
}

/** Generate a random room password */
export function generateRoomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export { selfId };
