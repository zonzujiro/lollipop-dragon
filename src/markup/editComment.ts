import type { Comment, CommentType } from "../types/criticmarkup";
import { serializeCommentBody } from "./commentProtocol";
import { escapeAnchorQuote } from "./commentAnchor";

// Rebuild the raw CriticMarkup string for a comment/highlight after an edit.
// Addition, deletion, and substitution are not editable through the comment UI.
export function replaceCommentMarkup(
  comment: Comment,
  type: CommentType,
  text: string,
): string {
  const body = serializeCommentBody({
    type,
    text,
    thread: comment.thread,
  });
  if (comment.criticType === "highlight") {
    return `{==${comment.highlightedText ?? ""}==}{>>${body}<<}`;
  }
  const anchorSuffix = comment.anchor
    ? ` @@ "${escapeAnchorQuote(comment.anchor.quote)}"${comment.anchor.occurrence > 1 ? ` @${comment.anchor.occurrence}` : ""}`
    : "";
  return `{>>${body}${anchorSuffix}<<}`;
}

// Return rawContent with the comment's markup replaced by the updated version.
export function applyEdit(
  rawContent: string,
  comment: Comment,
  type: CommentType,
  text: string,
): string {
  const newMarkup = replaceCommentMarkup(comment, type, text);
  return (
    rawContent.slice(0, comment.rawStart) +
    newMarkup +
    rawContent.slice(comment.rawEnd)
  );
}
