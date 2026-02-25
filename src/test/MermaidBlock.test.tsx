import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock mermaid before importing the component
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}))

// Mock Shiki so the MarkdownRenderer integration test doesn't try to load grammars
vi.mock('shiki', () => ({
  createHighlighter: vi.fn().mockResolvedValue({}),
}))

vi.mock('@shikijs/rehype/core', () => ({
  default: vi.fn(() => () => {}),
}))

describe('MermaidBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the SVG returned by mermaid', async () => {
    const mermaid = (await import('mermaid')).default
    vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg data-testid="diagram"></svg>', bindFunctions: undefined })

    const { MermaidBlock } = await import('../components/MermaidBlock')
    render(<MermaidBlock code="graph TD; A-->B" />)

    await waitFor(() => {
      expect(screen.getByTestId('diagram')).toBeInTheDocument()
    })
  })

  it('shows raw code and error message when mermaid fails', async () => {
    const mermaid = (await import('mermaid')).default
    vi.mocked(mermaid.render).mockRejectedValue(new Error('Parse error on line 1'))

    const { MermaidBlock } = await import('../components/MermaidBlock')
    render(<MermaidBlock code="invalid diagram code" />)

    await waitFor(() => {
      expect(screen.getByText('invalid diagram code')).toBeInTheDocument()
      expect(screen.getByText(/Mermaid error: Parse error on line 1/)).toBeInTheDocument()
    })
  })

  it('renders nothing while mermaid is still rendering', async () => {
    const mermaid = (await import('mermaid')).default
    vi.mocked(mermaid.render).mockReturnValue(new Promise(() => {})) // never resolves

    const { MermaidBlock } = await import('../components/MermaidBlock')
    const { container } = render(<MermaidBlock code="graph TD; A-->B" />)

    // Nothing rendered yet — no SVG, no error
    expect(container.querySelector('.mermaid-diagram')).toBeNull()
    expect(container.querySelector('.mermaid-error')).toBeNull()
  })

  it('re-renders when code prop changes', async () => {
    const mermaid = (await import('mermaid')).default
    vi.mocked(mermaid.render)
      .mockResolvedValueOnce({ svg: '<svg data-testid="first"></svg>', bindFunctions: undefined })
      .mockResolvedValueOnce({ svg: '<svg data-testid="second"></svg>', bindFunctions: undefined })

    const { MermaidBlock } = await import('../components/MermaidBlock')
    const { rerender } = render(<MermaidBlock code="graph TD; A-->B" />)

    await waitFor(() => expect(screen.getByTestId('first')).toBeInTheDocument())

    rerender(<MermaidBlock code="graph TD; B-->C" />)

    await waitFor(() => expect(screen.getByTestId('second')).toBeInTheDocument())
  })
})

describe('MarkdownRenderer — mermaid blocks', () => {
  beforeEach(async () => {
    const mermaid = (await import('mermaid')).default
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: '<svg data-testid="mermaid-svg"></svg>',
      bindFunctions: undefined,
    })
  })

  it('routes mermaid code blocks to MermaidBlock', async () => {
    const { useAppStore } = await import('../store')
    useAppStore.setState({
      rawContent: '```mermaid\ngraph TD; A-->B\n```',
    })

    const { MarkdownRenderer } = await import('../components/MarkdownRenderer')
    render(<MarkdownRenderer />)

    await waitFor(() => {
      expect(screen.getByTestId('mermaid-svg')).toBeInTheDocument()
    })
  })
})
