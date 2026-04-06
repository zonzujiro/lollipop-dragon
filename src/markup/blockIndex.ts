import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import type { Comment } from '../types/criticmarkup'

// Minimal shape of an mdast node's position — avoids importing @types/mdast
interface MdastNode {
  position?: { start: { offset: number }; end: { offset: number } }
}

export interface BlockPosition {
  index: number
  start: number  // inclusive offset in cleanMarkdown
  end: number    // exclusive offset in cleanMarkdown
}

// Parse cleanMarkdown and return the offset range of each top-level block.
export function getBlockPositions(cleanMarkdown: string): BlockPosition[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(cleanMarkdown) as {
    children: MdastNode[]
  }
  return tree.children.map((node, index) => ({
    index,
    start: node.position?.start.offset ?? 0,
    end: node.position?.end.offset ?? 0,
  }))
}

// Assign a blockIndex to each comment based on where its cleanStart falls.
export function assignBlockIndices(comments: Comment[], cleanMarkdown: string): Comment[] {
  if (comments.length === 0) {
    return comments
  }
  const positions = getBlockPositions(cleanMarkdown)
  if (positions.length === 0) {
    return comments
  }

  return comments.map((comment) => {
    const { cleanStart } = comment
    let blockIndex = positions.findIndex(
      ({ start, end }) => cleanStart >= start && cleanStart <= end,
    )
    // Fallback: position is past the last block (e.g. trailing comment)
    if (blockIndex === -1) {
      blockIndex = positions.length - 1
    }
    return { ...comment, blockIndex }
  })
}
