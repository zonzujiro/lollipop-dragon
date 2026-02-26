import type { CommentType } from "./criticmarkup";

// Stored in localStorage by the host — one entry per active share
export interface ShareRecord {
  docId: string;
  hostSecret: string;
  label: string; // file or folder name
  createdAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
  pendingCommentCount: number;
  keyB64: string; // encryption key in base64url (for link reconstruction)
  roomPassword: string; // room password for realtime
  fileCount: number; // number of files shared
}

// Decrypted content structure (inside the encrypted blob)
export interface SharePayload {
  version: "2.0";
  created_at: string; // ISO 8601
  tree: Record<string, string>; // { 'relative/path.md': 'raw markdown content' }
}

// Decrypted peer comment (inside an encrypted comment blob)
export interface PeerComment {
  id: string; // 'c_<uuid>'
  peerName: string;
  path: string; // file path matching SharePayload.tree key
  blockRef: {
    blockIndex: number;
    contentPreview: string; // first 80 chars of block text
  };
  commentType: CommentType;
  text: string;
  createdAt: string; // ISO 8601
}
