import type { Comment, CommentType } from '../types/criticmarkup'

// Rebuild the raw CriticMarkup string for a comment/highlight after an edit.
// Addition, deletion, and substitution are not editable through the comment UI.
export function replaceCommentMarkup(comment: Comment, type: CommentType, text: string): string {
  const prefix = type === 'note' ? '' : `${type}: `
  if (comment.criticType === 'highlight') {
    return `{==${comment.highlightedText ?? ''}==}{>>${prefix}${text}<<}`
  }
  return `{>>${prefix}${text}<<}`
}

// Return rawContent with the comment's markup replaced by the updated version.
export function applyEdit(
  rawContent: string,
  comment: Comment,
  type: CommentType,
  text: string,
): string {
  const newMarkup = replaceCommentMarkup(comment, type, text)
  return rawContent.slice(0, comment.rawStart) + newMarkup + rawContent.slice(comment.rawEnd)
}
