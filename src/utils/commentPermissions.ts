import type { Comment } from "../types/criticmarkup";

export function isAgentAuthoredComment(comment: Comment): boolean {
  return (
    (comment.type === "answer" && comment.thread?.authorLabel !== "You") ||
    Boolean(comment.thread?.authorLabel && comment.thread.authorLabel !== "You")
  );
}

export function canEditComment(comment: Comment): boolean {
  return !isAgentAuthoredComment(comment);
}
