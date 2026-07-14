import type { CommentType } from "../types/criticmarkup";

export const USER_COMMENT_TYPES: readonly CommentType[] = [
  "clarify",
  "rewrite",
];

export function normalizeUserCommentType(type: CommentType): CommentType {
  return USER_COMMENT_TYPES.includes(type) ? type : "clarify";
}
