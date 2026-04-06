import { describe, it, expect } from 'vitest'
import { extractComments, parseCriticMarkup, parseCommentType } from '../markup/criticmarkup'

describe('extractComments — no markup', () => {
  it('returns [] for an empty string', () => {
    expect(extractComments('')).toEqual([])
  })

  it('returns [] for plain markdown with no CriticMarkup', () => {
    expect(extractComments('# Hello\n\nJust a paragraph.')).toEqual([])
  })
})

describe('extractComments — highlight+comment {==…==}{>>…<<}', () => {
  it('extracts criticType, highlightedText, and text', () => {
    const [c] = extractComments('{==important==}{>>pay attention<<}')
    expect(c.criticType).toBe('highlight')
    expect(c.highlightedText).toBe('important')
    expect(c.text).toBe('pay attention')
  })

  it('records correct rawStart and rawEnd', () => {
    const source = 'before {==x==}{>>y<<} after'
    const [c] = extractComments(source)
    expect(c.rawStart).toBe(7)
    expect(c.rawEnd).toBe(21)
    expect(source.slice(c.rawStart, c.rawEnd)).toBe('{==x==}{>>y<<}')
  })

  it('preserves the full raw markup string', () => {
    const [c] = extractComments('{==text==}{>>note<<}')
    expect(c.raw).toBe('{==text==}{>>note<<}')
  })

  it('handles multiline highlighted text', () => {
    const [c] = extractComments('{==line one\nline two==}{>>comment<<}')
    expect(c.highlightedText).toBe('line one\nline two')
  })

  it('defaults type to "note"', () => {
    const [c] = extractComments('{==x==}{>>y<<}')
    expect(c.type).toBe('note')
  })
})

describe('extractComments — standalone comment {>>…<<}', () => {
  it('extracts criticType and text', () => {
    const [c] = extractComments('{>>standalone note<<}')
    expect(c.criticType).toBe('comment')
    expect(c.text).toBe('standalone note')
    expect(c.highlightedText).toBeUndefined()
  })

  it('records correct rawStart and rawEnd', () => {
    const source = 'hello {>>note<<} world'
    const [c] = extractComments(source)
    expect(c.rawStart).toBe(6)
    expect(c.rawEnd).toBe(16)
  })

  it('handles empty comment body', () => {
    const [c] = extractComments('{>><<}')
    expect(c.text).toBe('')
    expect(c.criticType).toBe('comment')
  })
})

describe('extractComments — addition {++…++}', () => {
  it('extracts criticType and text', () => {
    const [c] = extractComments('{++new content++}')
    expect(c.criticType).toBe('addition')
    expect(c.text).toBe('new content')
    expect(c.highlightedText).toBeUndefined()
  })

  it('records correct offsets', () => {
    const source = 'a {++b++} c'
    const [c] = extractComments(source)
    expect(c.rawStart).toBe(2)
    expect(c.rawEnd).toBe(9)
    expect(source.slice(c.rawStart, c.rawEnd)).toBe('{++b++}')
  })
})

describe('extractComments — deletion {--…--}', () => {
  it('extracts criticType and text', () => {
    const [c] = extractComments('{--old content--}')
    expect(c.criticType).toBe('deletion')
    expect(c.text).toBe('old content')
  })

  it('records correct offsets', () => {
    const source = 'x {--y--} z'
    const [c] = extractComments(source)
    expect(c.rawStart).toBe(2)
    expect(c.rawEnd).toBe(9)
  })
})

describe('extractComments — substitution {~~…~>…~~}', () => {
  it('extracts criticType, from, to, and text (=to)', () => {
    const [c] = extractComments('{~~old~>new~~}')
    expect(c.criticType).toBe('substitution')
    expect(c.from).toBe('old')
    expect(c.to).toBe('new')
    expect(c.text).toBe('new')
    expect(c.highlightedText).toBeUndefined()
  })

  it('records correct offsets', () => {
    const source = 'start {~~a~>b~~} end'
    const [c] = extractComments(source)
    expect(c.rawStart).toBe(6)
    expect(c.rawEnd).toBe(16)
    expect(source.slice(c.rawStart, c.rawEnd)).toBe('{~~a~>b~~}')
  })
})

describe('extractComments — multiple comments', () => {
  it('returns comments in document order', () => {
    const source = '{>>first<<} middle {++second++} end {--third--}'
    const comments = extractComments(source)
    expect(comments).toHaveLength(3)
    expect(comments[0].criticType).toBe('comment')
    expect(comments[1].criticType).toBe('addition')
    expect(comments[2].criticType).toBe('deletion')
  })

  it('assigns unique ids', () => {
    const source = '{>>a<<} {>>b<<} {>>c<<}'
    const comments = extractComments(source)
    const ids = comments.map((c) => c.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('handles all 5 types in one document', () => {
    const source = [
      '{==hi==}{>>comment<<}',
      '{>>note<<}',
      '{++add++}',
      '{--del--}',
      '{~~old~>new~~}',
    ].join(' ')
    const comments = extractComments(source)
    expect(comments).toHaveLength(5)
    const types = comments.map((c) => c.criticType)
    expect(types).toEqual(['highlight', 'comment', 'addition', 'deletion', 'substitution'])
  })

  it('handles consecutive comments with no gap', () => {
    const source = '{>>a<<}{>>b<<}'
    const comments = extractComments(source)
    expect(comments).toHaveLength(2)
    expect(comments[0].rawEnd).toBe(comments[1].rawStart)
  })
})

describe('extractComments — edge cases', () => {
  it('does not extract CriticMarkup inside fenced code blocks', () => {
    const source = '```\n{>>inside code<<}\n```'
    expect(extractComments(source)).toHaveLength(0)
  })

  it('handles markup at the very start of the string', () => {
    const [c] = extractComments('{>>start<<} rest')
    expect(c.rawStart).toBe(0)
  })

  it('handles markup at the very end of the string', () => {
    const source = 'rest {>>end<<}'
    const [c] = extractComments(source)
    expect(c.rawEnd).toBe(source.length)
  })

  it('does not confuse {--} with --- (hr)', () => {
    const source = '---\n{--deleted--}'
    const comments = extractComments(source)
    expect(comments).toHaveLength(1)
    expect(comments[0].criticType).toBe('deletion')
  })

  it('handles multiline comment body', () => {
    const [c] = extractComments('{>>line1\nline2<<}')
    expect(c.text).toBe('line1\nline2')
  })
})

// ─── Step 2.2 — clean markdown output ────────────────────────────────────────

describe('parseCriticMarkup — cleanMarkdown', () => {
  it('returns the source unchanged when there is no markup', () => {
    const src = '# Hello\n\nJust text.'
    expect(parseCriticMarkup(src).cleanMarkdown).toBe(src)
  })

  it('keeps highlighted text, strips comment wrapper', () => {
    const { cleanMarkdown } = parseCriticMarkup('before {==keep this==}{>>note<<} after')
    expect(cleanMarkdown).toBe('before keep this after')
  })

  it('removes standalone comments entirely', () => {
    const { cleanMarkdown } = parseCriticMarkup('hello {>>note<<} world')
    expect(cleanMarkdown).toBe('hello  world')
  })

  it('keeps added text, strips addition markers', () => {
    const { cleanMarkdown } = parseCriticMarkup('a {++new++} b')
    expect(cleanMarkdown).toBe('a new b')
  })

  it('removes deleted text entirely', () => {
    const { cleanMarkdown } = parseCriticMarkup('a {--old--} b')
    expect(cleanMarkdown).toBe('a  b')
  })

  it('keeps replacement text for substitutions', () => {
    const { cleanMarkdown } = parseCriticMarkup('{~~old~>new~~}')
    expect(cleanMarkdown).toBe('new')
  })

  it('preserves surrounding markdown structure with multiple comments', () => {
    const src = '# Title\n\n{>>note<<}Para {==hi==}{>>comment<<} end.\n\n- item'
    const { cleanMarkdown } = parseCriticMarkup(src)
    expect(cleanMarkdown).toBe('# Title\n\nPara hi end.\n\n- item')
  })

  it('leaves CriticMarkup inside ``` fenced blocks verbatim', () => {
    const src = 'text\n```\n{>>inside<<}\n```\nafter'
    const { cleanMarkdown, comments } = parseCriticMarkup(src)
    expect(cleanMarkdown).toBe(src)
    expect(comments).toHaveLength(0)
  })

  it('leaves CriticMarkup inside ~~~ fenced blocks verbatim', () => {
    const src = '~~~\n{++add++}\n~~~'
    const { cleanMarkdown, comments } = parseCriticMarkup(src)
    expect(cleanMarkdown).toBe(src)
    expect(comments).toHaveLength(0)
  })

  it('only skips markup inside the fence, not markup outside it', () => {
    const src = '{>>before<<}\n```\n{>>inside<<}\n```\n{>>after<<}'
    const { comments } = parseCriticMarkup(src)
    expect(comments).toHaveLength(2)
    expect(comments[0].text).toBe('before')
    expect(comments[1].text).toBe('after')
  })
})

describe('parseCriticMarkup — cleanStart / cleanEnd', () => {
  it('cleanStart === cleanEnd for a standalone comment (zero-length)', () => {
    const { comments, cleanMarkdown } = parseCriticMarkup('hello {>>note<<} world')
    const [c] = comments
    expect(c.cleanStart).toBe(c.cleanEnd)
    // The position in the clean string is right after "hello "
    expect(cleanMarkdown.slice(0, c.cleanStart)).toBe('hello ')
  })

  it('cleanStart === cleanEnd for a deletion (zero-length)', () => {
    const { comments } = parseCriticMarkup('a {--gone--} b')
    expect(comments[0].cleanStart).toBe(comments[0].cleanEnd)
  })

  it('cleanStart..cleanEnd spans the highlighted text', () => {
    const { comments, cleanMarkdown } = parseCriticMarkup('{==keep==}{>>note<<}')
    const [c] = comments
    expect(cleanMarkdown.slice(c.cleanStart, c.cleanEnd)).toBe('keep')
  })

  it('cleanStart..cleanEnd spans the added text', () => {
    const { comments, cleanMarkdown } = parseCriticMarkup('a {++new++} b')
    const [c] = comments
    expect(cleanMarkdown.slice(c.cleanStart, c.cleanEnd)).toBe('new')
  })

  it('cleanStart..cleanEnd spans the replacement text', () => {
    const { comments, cleanMarkdown } = parseCriticMarkup('x {~~old~>new~~} y')
    const [c] = comments
    expect(cleanMarkdown.slice(c.cleanStart, c.cleanEnd)).toBe('new')
  })

  it('clean offsets are correct across multiple mixed comments', () => {
    // "A {>>note<<} B {++add++} C"
    // clean: "A  B add C"
    //         0123456789
    const src = 'A {>>note<<} B {++add++} C'
    const { comments, cleanMarkdown } = parseCriticMarkup(src)
    expect(comments).toHaveLength(2)
    const [note, addition] = comments
    // note is zero-length at position 2 ("A " → pos 2)
    expect(note.cleanStart).toBe(2)
    expect(note.cleanEnd).toBe(2)
    // addition spans "add" starting after "A  B "
    expect(cleanMarkdown.slice(addition.cleanStart, addition.cleanEnd)).toBe('add')
  })
})

// ─── Step 2.3 — type prefix parsing ──────────────────────────────────────────

describe('parseCommentType — prefix recognition', () => {
  it.each(['fix', 'rewrite', 'expand', 'clarify', 'question', 'remove'])(
    'recognizes "%s:" prefix',
    (prefix) => {
      const { type, text } = parseCommentType(`${prefix}: some text`)
      expect(type).toBe(prefix)
      expect(text).toBe('some text')
    },
  )

  it('defaults to "note" when there is no prefix', () => {
    const { type, text } = parseCommentType('just a comment')
    expect(type).toBe('note')
    expect(text).toBe('just a comment')
  })

  it('is case-insensitive', () => {
    expect(parseCommentType('FIX: text').type).toBe('fix')
    expect(parseCommentType('Rewrite: text').type).toBe('rewrite')
    expect(parseCommentType('CLARIFY: text').type).toBe('clarify')
  })

  it('strips a single space after the colon', () => {
    expect(parseCommentType('fix: body').text).toBe('body')
  })

  it('strips multiple spaces after the colon', () => {
    expect(parseCommentType('fix:   body').text).toBe('body')
  })

  it('handles prefix with no space after colon', () => {
    const { type, text } = parseCommentType('fix:body')
    expect(type).toBe('fix')
    expect(text).toBe('body')
  })

  it('does not match a word that starts with a prefix but lacks a colon', () => {
    expect(parseCommentType('fixes the bug').type).toBe('note')
    expect(parseCommentType('rewriting everything').type).toBe('note')
  })

  it('does not match an unrecognized prefix', () => {
    expect(parseCommentType('todo: do something').type).toBe('note')
  })

  it('handles an empty body after the prefix', () => {
    const { type, text } = parseCommentType('fix: ')
    expect(type).toBe('fix')
    expect(text).toBe('')
  })
})

describe('parseCriticMarkup — type field via prefix', () => {
  it('sets type from prefix in a standalone comment', () => {
    const [c] = extractComments('{>>fix: broken sentence<<}')
    expect(c.type).toBe('fix')
    expect(c.text).toBe('broken sentence')
  })

  it('sets type from prefix in a highlight+comment', () => {
    const [c] = extractComments('{==passage==}{>>rewrite: too verbose<<}')
    expect(c.type).toBe('rewrite')
    expect(c.text).toBe('too verbose')
    expect(c.highlightedText).toBe('passage')
  })

  it('addition criticType always has type "note" (no prefix parsing)', () => {
    const [c] = extractComments('{++fix: added text++}')
    expect(c.criticType).toBe('addition')
    expect(c.type).toBe('note')
    // text is the raw addition content, prefix is not stripped
    expect(c.text).toBe('fix: added text')
  })

  it('deletion criticType always has type "note"', () => {
    const [c] = extractComments('{--fix: removed text--}')
    expect(c.type).toBe('note')
  })

  it('substitution criticType always has type "note"', () => {
    const [c] = extractComments('{~~old~>fix: new~~}')
    expect(c.type).toBe('note')
  })

  it('raw field is preserved unchanged (includes the prefix)', () => {
    const [c] = extractComments('{>>fix: something<<}')
    expect(c.raw).toBe('{>>fix: something<<}')
  })
})
