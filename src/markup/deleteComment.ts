import type { Comment } from '../types/criticmarkup'

// Return rawContent with the comment's raw markup removed entirely.
export function applyDelete(rawContent: string, comment: Comment): string {
  return rawContent.slice(0, comment.rawStart) + rawContent.slice(comment.rawEnd)
}
