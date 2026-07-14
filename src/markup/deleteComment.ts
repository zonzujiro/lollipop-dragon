import type { Comment } from "../types/criticmarkup";

// Return rawContent with the comment's raw markup removed entirely.
export function applyDelete(rawContent: string, comment: Comment): string {
  const replacement =
    comment.criticType === "highlight" ? (comment.highlightedText ?? "") : "";
  return (
    rawContent.slice(0, comment.rawStart) +
    replacement +
    rawContent.slice(comment.rawEnd)
  );
}

export function applyDeleteMany(
  rawContent: string,
  comments: Comment[],
): string {
  return [...comments]
    .sort(
      (leftComment, rightComment) =>
        rightComment.rawStart - leftComment.rawStart,
    )
    .reduce(
      (nextRawContent, comment) => applyDelete(nextRawContent, comment),
      rawContent,
    );
}
