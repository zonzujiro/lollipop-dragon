import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setTestState, resetTestStore } from './testHelpers'

// Mock shiki so tests don't load real language grammars
vi.mock('shiki', () => ({
  createHighlighter: vi.fn().mockResolvedValue({
    codeToHast: vi.fn().mockReturnValue({
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'pre',
          properties: { className: ['shiki', 'github-light'] },
          children: [
            {
              type: 'element',
              tagName: 'code',
              properties: {},
              children: [{ type: 'text', value: 'const x = 1' }],
            },
          ],
        },
      ],
    }),
  }),
}))

vi.mock('@shikijs/rehype/core', () => ({
  default: vi.fn(() => () => {}),
}))

beforeEach(() => {
  resetTestStore()
  setTestState({ fileHandle: null, fileName: null, rawContent: '' })
  vi.clearAllMocks()
})

describe('MarkdownRenderer — Shiki integration', () => {
  it('initializes the shiki highlighter on mount', async () => {
    const { createHighlighter } = await import('shiki')
    setTestState({ rawContent: '```js\nconst x = 1\n```' })

    const { MarkdownRenderer } = await import('../components/MarkdownRenderer')
    render(<MarkdownRenderer />)

    await waitFor(() => {
      expect(createHighlighter).toHaveBeenCalledWith(
        expect.objectContaining({
          themes: expect.arrayContaining(['github-light']),
          langs: expect.any(Array),
        }),
      )
    })
  })

  it('applies rehypeShikiFromHighlighter once the highlighter is ready', async () => {
    const { default: rehypeShikiFromHighlighter } = await import('@shikijs/rehype/core')
    setTestState({ rawContent: '```ts\nconst y: number = 2\n```' })

    const { MarkdownRenderer } = await import('../components/MarkdownRenderer')
    render(<MarkdownRenderer />)

    await waitFor(() => {
      expect(rehypeShikiFromHighlighter).toHaveBeenCalled()
    })
  })

  it('still renders code blocks before the highlighter is ready', async () => {
    // Use a delayed highlighter to simulate loading state
    const { createHighlighter } = await import('shiki')
    vi.mocked(createHighlighter).mockReturnValueOnce(new Promise(() => {})) // never resolves

    setTestState({ rawContent: '```js\nconst z = 3\n```' })

    const { MarkdownRenderer } = await import('../components/MarkdownRenderer')
    render(<MarkdownRenderer />)

    // Code block text is present even without highlighting
    expect(screen.getByText('const z = 3')).toBeInTheDocument()
  })
})
