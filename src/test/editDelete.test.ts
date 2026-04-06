import { describe, it, expect } from 'vitest'
import { replaceCommentMarkup, applyEdit } from '../markup/editComment'
import { applyDelete } from '../markup/deleteComment'
import { makeComment } from './testHelpers'

describe('replaceCommentMarkup', () => {
  it('builds a note comment with no prefix', () => {
    expect(replaceCommentMarkup(makeComment(), 'note', 'my note')).toBe('{>>my note<<}')
  })

  it('builds a typed comment with prefix', () => {
    expect(replaceCommentMarkup(makeComment(), 'fix', 'fix this')).toBe('{>>fix: fix this<<}')
  })

  it('preserves highlight span when criticType is highlight', () => {
    const c = makeComment({ criticType: 'highlight', highlightedText: 'important span' })
    expect(replaceCommentMarkup(c, 'note', 'a note')).toBe('{==important span==}{>>a note<<}')
  })

  it('preserves highlight span with typed prefix', () => {
    const c = makeComment({ criticType: 'highlight', highlightedText: 'text' })
    expect(replaceCommentMarkup(c, 'rewrite', 'rewrite it')).toBe('{==text==}{>>rewrite: rewrite it<<}')
  })
})

describe('applyEdit', () => {
  it('replaces comment in the middle of the content', () => {
    const raw = 'Before.{>>old<<}After.'
    const c = makeComment({ raw: '{>>old<<}', rawStart: 7, rawEnd: 16 })
    expect(applyEdit(raw, c, 'fix', 'new')).toBe('Before.{>>fix: new<<}After.')
  })

  it('replaces comment at the start', () => {
    const raw = '{>>start<<}rest'
    const c = makeComment({ raw: '{>>start<<}', rawStart: 0, rawEnd: 11 })
    expect(applyEdit(raw, c, 'note', 'updated')).toBe('{>>updated<<}rest')
  })
})

describe('applyDelete', () => {
  it('removes the comment markup from content', () => {
    const raw = 'Hello.{>>delete me<<} World.'
    const c = makeComment({ rawStart: 6, rawEnd: 21 })
    expect(applyDelete(raw, c)).toBe('Hello. World.')
  })

  it('removes a comment at the start', () => {
    const raw = '{>>start<<}rest'
    const c = makeComment({ rawStart: 0, rawEnd: 11 })
    expect(applyDelete(raw, c)).toBe('rest')
  })

  it('removes a comment at the end', () => {
    const raw = 'content{>>end<<}'
    const c = makeComment({ rawStart: 7, rawEnd: 16 })
    expect(applyDelete(raw, c)).toBe('content')
  })
})
