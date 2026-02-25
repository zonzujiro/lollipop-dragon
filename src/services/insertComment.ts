import { getBlockPositions } from './blockIndex'
import type { Comment, CommentType } from '../types/criticmarkup'

// A segment maps a range of cleanMarkdown offsets to a range of raw offsets.
// Plain segments are 1:1; replaced segments (CriticMarkup spans) map any
// position within the clean replacement to the raw end of the markup.
interface Segment {
  cleanStart: number
  cleanEnd: number
  rawStart: number
  rawEnd: number
  isPlain: boolean
}

function buildSegments(source: string, comments: Comment[]): Segment[] {
  const sorted = [...comments].sort((a, b) => a.rawStart - b.rawStart)
  const segs: Segment[] = []
  let rawPos = 0
  let cleanPos = 0

  for (const c of sorted) {
    if (c.rawStart > rawPos) {
      const len = c.rawStart - rawPos
      segs.push({ cleanStart: cleanPos, cleanEnd: cleanPos + len, rawStart: rawPos, rawEnd: c.rawStart, isPlain: true })
      cleanPos += len
      rawPos = c.rawStart
    }
    const cleanLen = c.cleanEnd - c.cleanStart
    segs.push({ cleanStart: cleanPos, cleanEnd: cleanPos + cleanLen, rawStart: rawPos, rawEnd: c.rawEnd, isPlain: false })
    cleanPos += cleanLen
    rawPos = c.rawEnd
  }

  if (rawPos < source.length) {
    const len = source.length - rawPos
    segs.push({ cleanStart: cleanPos, cleanEnd: cleanPos + len, rawStart: rawPos, rawEnd: source.length, isPlain: true })
  }

  return segs
}

// Convert a cleanMarkdown offset to the corresponding raw content offset.
// For positions inside a CriticMarkup span, maps to the raw end (after the markup).
// Iterates backwards so that a cleanOffset on a shared boundary (e.g. a zero-width
// replacement) resolves to the later (non-plain) segment rather than the preceding plain one.
function cleanToRaw(cleanOffset: number, segments: Segment[]): number {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].cleanStart <= cleanOffset) {
      const seg = segments[i]
      return seg.isPlain
        ? seg.rawStart + (cleanOffset - seg.cleanStart)
        : seg.rawEnd
    }
  }
  return cleanOffset
}

// Insert a new CriticMarkup comment after the block at blockIndex.
// Returns the updated raw content string.
export function insertComment(
  rawContent: string,
  existingComments: Comment[],
  cleanMarkdown: string,
  blockIndex: number,
  type: CommentType,
  text: string,
): string {
  const blocks = getBlockPositions(cleanMarkdown)
  if (blockIndex < 0 || blockIndex >= blocks.length) return rawContent

  const blockEnd = blocks[blockIndex].end
  const segments = buildSegments(rawContent, existingComments)
  const rawPos = cleanToRaw(blockEnd, segments)

  const prefix = type === 'note' ? '' : `${type}: `
  const markup = `{>>${prefix}${text}<<}`
  return rawContent.slice(0, rawPos) + markup + rawContent.slice(rawPos)
}
