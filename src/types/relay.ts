import type { PeerComment } from "./share";

export interface RelayFrame {
  version: 1;
  docId: string;
  payload: string;
}

export interface SubscribeFrame {
  type: "subscribe";
  docId: string;
  role: "host" | "peer";
  hostSecret?: string;
}

export interface UnsubscribeFrame {
  type: "unsubscribe";
  docId: string;
}

export interface CommentAddFrame {
  type: "comment:add";
  docId: string;
  cmtId: string;
  payload: string;
}

export interface CommentResolveFrame {
  type: "comment:resolve";
  docId: string;
  cmtId: string;
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

export interface CommentAddAckFrame {
  type: "comment:add:ack";
  docId: string;
  cmtId: string;
}

export interface CommentResolveAckFrame {
  type: "comment:resolve:ack";
  docId: string;
  cmtId: string;
}

export interface CommentsSnapshotEntry {
  cmtId: string;
  payload: string;
}

export interface CommentsSnapshotFrame {
  type: "comments:snapshot";
  docId: string;
  comments: CommentsSnapshotEntry[];
}

export interface CommentAddedFrame {
  type: "comment:added";
  docId: string;
  cmtId: string;
  payload: string;
}

export interface CommentResolvedFrame {
  type: "comment:resolved";
  docId: string;
  cmtId: string;
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
  | CommentAddFrame
  | CommentResolveFrame
  | PingFrame;

export type InboundFrame =
  | RelayFrame
  | ErrorFrame
  | SubscribeOkFrame
  | CommentAddAckFrame
  | CommentResolveAckFrame
  | CommentsSnapshotFrame
  | CommentAddedFrame
  | CommentResolvedFrame
  | PongFrame;

export interface DocumentUpdatedMessage {
  type: "document:updated";
  updatedAt: string;
}

export type RelayMessage = DocumentUpdatedMessage;

export type RelayEvent =
  | { type: "comment:add:ack"; cmtId: string }
  | { type: "comment:resolve:ack"; cmtId: string }
  | { type: "comments:snapshot"; comments: CommentsSnapshotEntry[] }
  | { type: "comment:added"; cmtId: string; payload: string }
  | { type: "comment:resolved"; cmtId: string }
  | DocumentUpdatedMessage;

export interface DecryptedCommentEvent {
  type: "comment:added";
  comment: PeerComment;
}
