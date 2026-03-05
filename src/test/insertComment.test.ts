import { describe, it, expect } from 'vitest'
import { insertComment } from '../services/insertComment'
import { makeComment } from './testHelpers'

describe('insertComment — plain content (no existing markup)', () => {
  it('appends a note comment (no prefix) after the first paragraph', () => {
    const raw = 'Hello world.\n\nSecond paragraph.'
    const result = insertComment(raw, [], raw, 0, 'note', 'my note')
    expect(result).toBe('Hello world.{>>my note<<}\n\nSecond paragraph.')
  })

  it('appends a typed comment with its prefix after a later paragraph', () => {
    const raw = 'First.\n\nSecond.'
    const result = insertComment(raw, [], raw, 1, 'fix', 'fix this')
    expect(result).toBe('First.\n\nSecond.{>>fix: fix this<<}')
  })

  it('returns rawContent unchanged when blockIndex is out of range', () => {
    const raw = 'Single paragraph.'
    expect(insertComment(raw, [], raw, 5, 'note', 'hi')).toBe(raw)
    expect(insertComment(raw, [], raw, -1, 'note', 'hi')).toBe(raw)
  })

  it('handles a single-paragraph document', () => {
    const raw = 'Only paragraph.'
    const result = insertComment(raw, [], raw, 0, 'rewrite', 'rewrite it')
    expect(result).toBe('Only paragraph.{>>rewrite: rewrite it<<}')
  })
})

describe('insertComment — content with existing CriticMarkup', () => {
  it('inserts after a block that ends with a {>>comment<<} (zero-width replacement)', () => {
    // raw: "Hello.{>>existing<<}\n\nSecond."
    // comment removes itself from clean ("Hello.\n\nSecond.")
    const raw = 'Hello.{>>existing<<}\n\nSecond.'
    const clean = 'Hello.\n\nSecond.'
    const existing = [
      makeComment({ rawStart: 6, rawEnd: 20, cleanStart: 6, cleanEnd: 6 }),
      // {>>existing<<} = 14 chars (6..20)
    ]
    const result = insertComment(raw, existing, clean, 0, 'note', 'new')
    // Block 0 ends at clean offset 6, which maps to raw offset 20 (after the markup)
    expect(result).toBe('Hello.{>>existing<<}{>>new<<}\n\nSecond.')
  })

  it('inserts after a block containing a {++addition++} (text kept in clean)', () => {
    // raw: "Hello {++world++}.\n\nSecond."
    // clean: "Hello world.\n\nSecond."
    const raw = 'Hello {++world++}.\n\nSecond.'
    const clean = 'Hello world.\n\nSecond.'
    const existing = [
      makeComment({
        criticType: 'addition',
        rawStart: 6, rawEnd: 17,    // "{++world++}" = 11 chars
        cleanStart: 6, cleanEnd: 11, // "world" = 5 chars
      }),
    ]
    const result = insertComment(raw, existing, clean, 0, 'note', 'note')
    // Block 0 ends at clean offset 12 ("Hello world."), which is in the plain
    // segment after the addition span. Raw offset = 17 + (12 - 11) = 18 (the '.')
    expect(result).toBe('Hello {++world++}.{>>note<<}\n\nSecond.')
  })

  it('inserts after the second block in a multi-block document with markup', () => {
    const raw = 'Para one.\n\nPara two.{>>existing<<}'
    const clean = 'Para one.\n\nPara two.'
    const existing = [
      makeComment({ rawStart: 20, rawEnd: 34, cleanStart: 20, cleanEnd: 20 }),
    ]
    const result = insertComment(raw, existing, clean, 1, 'fix', 'fix it')
    expect(result).toBe('Para one.\n\nPara two.{>>existing<<}{>>fix: fix it<<}')
  })
})
