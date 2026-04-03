import type { PeerComment } from "./share";

// --- Wire protocol (plaintext, seen by the DO) ---

export interface RelayFrame {
  version: 1;
  docId: string;
  payload: string;
}

export interface SubscribeFrame {
  type: "subscribe";
  docId: string;
}

export interface UnsubscribeFrame {
  type: "unsubscribe";
  docId: string;
}

export interface ErrorFrame {
  type: "error";
  docId: string;
  message: string;
}

export interface SubscribeOkFrame {
  type: "subscribe:ok";
  docId: string;
}

export interface PingFrame {
  type: "ping";
}

export interface PongFrame {
  type: "pong";
}

export type ControlFrame =
  | SubscribeFrame
  | UnsubscribeFrame
  | PingFrame;

export type InboundFrame =
  | RelayFrame
  | ErrorFrame
  | SubscribeOkFrame
  | PongFrame;

// --- Relay messages (inside encrypted payload) ---

export type RelayMessage =
  | CommentAddedMessage
  | CommentResolvedMessage
  | DocumentUpdatedMessage;

export interface CommentAddedMessage {
  type: "comment:added";
  comment: PeerComment;
}

export interface CommentResolvedMessage {
  type: "comment:resolved";
  commentId: string;
}

export interface DocumentUpdatedMessage {
  type: "document:updated";
  updatedAt: string;
}
