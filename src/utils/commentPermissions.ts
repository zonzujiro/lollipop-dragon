import type { Comment } from "../types/criticmarkup";

export function isAgentAuthoredComment(comment: Comment): boolean {
  return comment.type === "answer" || Boolean(comment.thread?.authorLabel);
}

export function canEditComment(comment: Comment): boolean {
  return !isAgentAuthoredComment(comment);
}
