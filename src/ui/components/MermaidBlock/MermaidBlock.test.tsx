import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import mermaid from 'mermaid'
import { MermaidBlock } from "./index";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { resetTestStore, setTestState } from "../../../test/testHelpers";

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
    vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg data-testid="diagram"></svg>', bindFunctions: undefined })

    render(<MermaidBlock code="graph TD; A-->B" />)

    await waitFor(() => {
      expect(screen.getByTestId('diagram')).toBeInTheDocument()
    })
  })

  it('shows raw code and error message when mermaid fails', async () => {
    vi.mocked(mermaid.render).mockRejectedValue(new Error('Parse error on line 1'))

    render(<MermaidBlock code="invalid diagram code" />)

    await waitFor(() => {
      expect(screen.getByText('invalid diagram code')).toBeInTheDocument()
      expect(screen.getByText(/Mermaid error: Parse error on line 1/)).toBeInTheDocument()
    })
  })

  it('renders nothing while mermaid is still rendering', async () => {
    vi.mocked(mermaid.render).mockReturnValue(new Promise(() => {})) // never resolves

    const { container } = render(<MermaidBlock code="graph TD; A-->B" />)

    // Nothing rendered yet — no SVG, no error
    expect(container.querySelector('.mermaid-diagram')).toBeNull()
    expect(container.querySelector('.mermaid-error')).toBeNull()
  })

  it('shows a direction toggle button for graph/flowchart diagrams', async () => {
    vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg></svg>', bindFunctions: undefined })

    render(<MermaidBlock code="graph TD; A-->B" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Switch to LR layout' })).toBeInTheDocument()
    })
  })

  it('does not show a direction button for non-directional diagrams', async () => {
    vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg></svg>', bindFunctions: undefined })

    render(<MermaidBlock code="sequenceDiagram\nA->>B: Hello" />)

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Switch to/ })).not.toBeInTheDocument()
    })
  })

  it('re-renders with LR direction when toggle button is clicked', async () => {
    vi.mocked(mermaid.render)
      .mockResolvedValueOnce({ svg: '<svg data-testid="td"></svg>', bindFunctions: undefined })
      .mockResolvedValueOnce({ svg: '<svg data-testid="lr"></svg>', bindFunctions: undefined })

    render(<MermaidBlock code="graph TD; A-->B" />)

    await waitFor(() => screen.getByTestId('td'))

    const [, lastCall] = vi.mocked(mermaid.render).mock.calls
    expect(lastCall).toBeUndefined() // only one render so far

    await userEvent.click(screen.getByRole('button', { name: 'Switch to LR layout' }))

    await waitFor(() => screen.getByTestId('lr'))

    const lrCode = vi.mocked(mermaid.render).mock.calls[1][1]
    expect(lrCode).toMatch(/graph LR/i)
  })

  it('button label flips to TD after switching to LR', async () => {
    vi.mocked(mermaid.render)
      .mockResolvedValue({ svg: '<svg></svg>', bindFunctions: undefined })

    render(<MermaidBlock code="graph TD; A-->B" />)

    await waitFor(() => screen.getByRole('button', { name: 'Switch to LR layout' }))
    await userEvent.click(screen.getByRole('button', { name: 'Switch to LR layout' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Switch to TD layout' })).toBeInTheDocument()
    })
  })

  it('resets direction override when code prop changes', async () => {
    vi.mocked(mermaid.render)
      .mockResolvedValue({ svg: '<svg></svg>', bindFunctions: undefined })

    const { rerender } = render(<MermaidBlock code="graph TD; A-->B" />)

    await waitFor(() => screen.getByRole('button', { name: 'Switch to LR layout' }))
    await userEvent.click(screen.getByRole('button', { name: 'Switch to LR layout' }))
    await waitFor(() => screen.getByRole('button', { name: 'Switch to TD layout' }))

    rerender(<MermaidBlock code="graph TD; B-->C" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Switch to LR layout' })).toBeInTheDocument()
    })
  })

  it('re-renders when code prop changes', async () => {
    vi.mocked(mermaid.render)
      .mockResolvedValueOnce({ svg: '<svg data-testid="first"></svg>', bindFunctions: undefined })
      .mockResolvedValueOnce({ svg: '<svg data-testid="second"></svg>', bindFunctions: undefined })

    const { rerender } = render(<MermaidBlock code="graph TD; A-->B" />)

    await waitFor(() => expect(screen.getByTestId('first')).toBeInTheDocument())

    rerender(<MermaidBlock code="graph TD; B-->C" />)

    await waitFor(() => expect(screen.getByTestId('second')).toBeInTheDocument())
  })
})

describe('MarkdownRenderer — mermaid blocks', () => {
  beforeEach(() => {
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: '<svg data-testid="mermaid-svg"></svg>',
      bindFunctions: undefined,
    })
  })

  it('routes mermaid code blocks to MermaidBlock', async () => {
    resetTestStore()
    setTestState({
      rawContent: '```mermaid\ngraph TD; A-->B\n```',
    })

    render(<MarkdownRenderer />)

    await waitFor(() => {
      expect(screen.getByTestId('mermaid-svg')).toBeInTheDocument()
    })
  })
})
