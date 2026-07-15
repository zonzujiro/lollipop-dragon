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
  fileCount: number; // number of files shared
  sharedPaths?: string[]; // original file paths included in the share
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

export function isShareRecord(value: unknown): value is ShareRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "docId" in value &&
    typeof value.docId === "string" &&
    "hostSecret" in value &&
    typeof value.hostSecret === "string" &&
    "label" in value &&
    typeof value.label === "string" &&
    "createdAt" in value &&
    typeof value.createdAt === "string" &&
    "expiresAt" in value &&
    typeof value.expiresAt === "string" &&
    "pendingCommentCount" in value &&
    typeof value.pendingCommentCount === "number" &&
    "keyB64" in value &&
    typeof value.keyB64 === "string" &&
    "fileCount" in value &&
    typeof value.fileCount === "number" &&
    (!("sharedPaths" in value) ||
      value.sharedPaths === undefined ||
      isStringArray(value.sharedPaths))
  );
}

export function isShareRecordArray(value: unknown): value is ShareRecord[] {
  return Array.isArray(value) && value.every(isShareRecord);
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
    anchorVersion?: 1;
    quote?: string;
    occurrence?: number;
  };
  commentType: CommentType;
  text: string;
  createdAt: string; // ISO 8601
}
