import type { CommentType } from "../types/criticmarkup";

export const USER_COMMENT_TYPES: readonly CommentType[] = [
  "note",
  "question",
  "clarify",
  "rewrite",
  "remove",
];

export const DEFAULT_USER_COMMENT_TYPE: CommentType = "note";

export const ORPHANED_COMMENT_MESSAGE =
  "We can’t find the text this comment refers to. The comment is still saved, but it’s no longer highlighted in the document.";

export function normalizeUserCommentType(type: CommentType): CommentType {
  return USER_COMMENT_TYPES.includes(type) ? type : DEFAULT_USER_COMMENT_TYPE;
}

export function isUserCommentType(value: string): value is CommentType {
  return USER_COMMENT_TYPES.some((commentType) => commentType === value);
}
