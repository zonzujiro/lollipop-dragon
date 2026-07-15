import type { CommentType } from "../types/criticmarkup";

export const USER_COMMENT_TYPES: readonly CommentType[] = [
  "question",
  "clarify",
  "rewrite",
  "remove",
];

export const DEFAULT_USER_COMMENT_TYPE: CommentType = "question";

export function normalizeUserCommentType(type: CommentType): CommentType {
  return USER_COMMENT_TYPES.includes(type) ? type : DEFAULT_USER_COMMENT_TYPE;
}
