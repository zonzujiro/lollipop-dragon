import { describe, it, expect } from 'vitest'
import { getBlockPositions, assignBlockIndices } from '../services/blockIndex'
import { makeComment as makeCommentBase } from './testHelpers'

function makeComment(cleanStart: number, cleanEnd = cleanStart) {
  return makeCommentBase({ id: String(cleanStart), cleanStart, cleanEnd })
}

describe('getBlockPositions', () => {
  it('returns [] for an empty string', () => {
    expect(getBlockPositions('')).toEqual([])
  })

  it('returns one entry for a single paragraph', () => {
    const positions = getBlockPositions('Hello world')
    expect(positions).toHaveLength(1)
    expect(positions[0].index).toBe(0)
    expect(positions[0].start).toBe(0)
    expect(positions[0].end).toBeGreaterThan(0)
  })

  it('returns separate entries for each top-level block', () => {
    const md = '# Heading\n\nParagraph one.\n\nParagraph two.'
    const positions = getBlockPositions(md)
    expect(positions).toHaveLength(3)
  })

  it('block indices are sequential starting from 0', () => {
    const md = '# H1\n\n## H2\n\nParagraph.'
    const positions = getBlockPositions(md)
    expect(positions.map((p) => p.index)).toEqual([0, 1, 2])
  })

  it('code fences count as a single block', () => {
    const md = 'Intro.\n\n```js\nconst x = 1\n```\n\nOutro.'
    const positions = getBlockPositions(md)
    expect(positions).toHaveLength(3)
  })

  it('a list is a single top-level block', () => {
    const md = '- item one\n- item two\n- item three'
    const positions = getBlockPositions(md)
    expect(positions).toHaveLength(1)
  })

  it('block start and end are non-decreasing', () => {
    const md = '# H\n\nPara 1.\n\nPara 2.\n\nPara 3.'
    const positions = getBlockPositions(md)
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i].start).toBeGreaterThan(positions[i - 1].start)
      expect(positions[i].end).toBeGreaterThan(positions[i - 1].end)
    }
  })
})

describe('assignBlockIndices', () => {
  it('returns the same array when there are no comments', () => {
    const result = assignBlockIndices([], 'Hello')
    expect(result).toHaveLength(0)
  })

  it('assigns blockIndex 0 to a comment in the first block', () => {
    const md = 'First block.\n\nSecond block.'
    const [c] = assignBlockIndices([makeComment(0)], md)
    expect(c.blockIndex).toBe(0)
  })

  it('assigns blockIndex 1 to a comment in the second block', () => {
    // "First block.\n\nSecond block."
    //  0            13 15
    const md = 'First block.\n\nSecond block.'
    const positions = getBlockPositions(md)
    // Place comment inside the second block
    const secondStart = positions[1].start
    const [c] = assignBlockIndices([makeComment(secondStart)], md)
    expect(c.blockIndex).toBe(1)
  })

  it('assigns the last blockIndex to a comment past the last block', () => {
    const md = 'Only block.'
    const [c] = assignBlockIndices([makeComment(9999)], md)
    expect(c.blockIndex).toBe(0)
  })

  it('assigns correct indices for multiple comments across blocks', () => {
    const md = '# Title\n\nFirst paragraph.\n\nSecond paragraph.'
    const positions = getBlockPositions(md)
    const comments = [
      makeComment(positions[0].start),  // in block 0
      makeComment(positions[1].start),  // in block 1
      makeComment(positions[2].start),  // in block 2
    ]
    const result = assignBlockIndices(comments, md)
    expect(result[0].blockIndex).toBe(0)
    expect(result[1].blockIndex).toBe(1)
    expect(result[2].blockIndex).toBe(2)
  })

  it('does not mutate the original comment objects', () => {
    const md = 'Hello.'
    const original = makeComment(0)
    const [result] = assignBlockIndices([original], md)
    expect(result).not.toBe(original)
    expect(original.blockIndex).toBeUndefined()
  })

  it('handles zero-length (comment/deletion) positions', () => {
    // A standalone comment has cleanStart === cleanEnd (zero-length)
    const md = 'Para one.\n\nPara two.'
    const positions = getBlockPositions(md)
    const zerolen = makeComment(positions[1].start, positions[1].start)
    const [c] = assignBlockIndices([zerolen], md)
    expect(c.blockIndex).toBe(1)
  })
})
