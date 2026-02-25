import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { MarkdownRenderer } from '../components/MarkdownRenderer'
import { useAppStore } from '../store'

function setContent(raw: string) {
  useAppStore.setState({ rawContent: raw })
}

beforeEach(() => {
  useAppStore.setState({ fileHandle: null, fileName: null, rawContent: '' })
})

describe('MarkdownRenderer — CommonMark', () => {
  it('renders headings h1–h3', () => {
    setContent('# H1\n## H2\n### H3')
    render(<MarkdownRenderer />)
    expect(screen.getByRole('heading', { level: 1, name: 'H1' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'H2' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'H3' })).toBeInTheDocument()
  })

  it('renders headings h4–h6', () => {
    setContent('#### H4\n##### H5\n###### H6')
    render(<MarkdownRenderer />)
    expect(screen.getByRole('heading', { level: 4, name: 'H4' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 5, name: 'H5' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 6, name: 'H6' })).toBeInTheDocument()
  })

  it('renders paragraphs', () => {
    setContent('First paragraph.\n\nSecond paragraph.')
    render(<MarkdownRenderer />)
    expect(screen.getByText('First paragraph.')).toBeInTheDocument()
    expect(screen.getByText('Second paragraph.')).toBeInTheDocument()
  })

  it('renders bold and italic', () => {
    setContent('**bold** and *italic*')
    render(<MarkdownRenderer />)
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('italic').tagName).toBe('EM')
  })

  it('renders inline code', () => {
    setContent('Use `console.log()` for debugging.')
    render(<MarkdownRenderer />)
    expect(screen.getByText('console.log()')).toBeInTheDocument()
  })

  it('renders fenced code blocks', () => {
    setContent('```js\nconst x = 1\n```')
    render(<MarkdownRenderer />)
    expect(screen.getByText('const x = 1')).toBeInTheDocument()
  })

  it('renders blockquotes', () => {
    setContent('> This is a quote.')
    render(<MarkdownRenderer />)
    expect(screen.getByText('This is a quote.')).toBeInTheDocument()
  })

  it('renders links', () => {
    setContent('[Click here](https://example.com)')
    render(<MarkdownRenderer />)
    const link = screen.getByRole('link', { name: 'Click here' })
    expect(link).toHaveAttribute('href', 'https://example.com')
  })

  it('renders unordered lists', () => {
    setContent('- Apple\n- Banana\n- Cherry')
    render(<MarkdownRenderer />)
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.getByText('Cherry')).toBeInTheDocument()
  })

  it('renders ordered lists', () => {
    setContent('1. First\n2. Second\n3. Third')
    render(<MarkdownRenderer />)
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByText('First')).toBeInTheDocument()
  })

  it('renders nested lists', () => {
    setContent('- Top\n  - Nested A\n  - Nested B\n- Bottom')
    render(<MarkdownRenderer />)
    const lists = screen.getAllByRole('list')
    expect(lists.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Nested A')).toBeInTheDocument()
    expect(screen.getByText('Nested B')).toBeInTheDocument()
  })

  it('renders horizontal rules', () => {
    setContent('Above\n\n---\n\nBelow')
    const { container } = render(<MarkdownRenderer />)
    expect(container.querySelector('hr')).toBeInTheDocument()
  })

  it('renders images', () => {
    setContent('![Alt text](https://example.com/image.png)')
    const { container } = render(<MarkdownRenderer />)
    const img = container.querySelector('img')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('alt', 'Alt text')
    expect(img).toHaveAttribute('src', 'https://example.com/image.png')
  })
})

describe('MarkdownRenderer — GFM extras', () => {
  it('renders GFM tables', () => {
    setContent('| Name | Age |\n|------|-----|\n| Alice | 30 |\n| Bob | 25 |')
    render(<MarkdownRenderer />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('renders task lists', () => {
    setContent('- [x] Done\n- [ ] Not done')
    render(<MarkdownRenderer />)
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)
    expect(checkboxes[0]).toBeChecked()
    expect(checkboxes[1]).not.toBeChecked()
  })

  it('renders strikethrough', () => {
    setContent('~~deleted text~~')
    render(<MarkdownRenderer />)
    const el = screen.getByText('deleted text')
    expect(el.tagName).toBe('DEL')
  })

  it('renders footnotes', () => {
    setContent('Text with a note[^1].\n\n[^1]: Footnote content here.')
    const { container } = render(<MarkdownRenderer />)
    expect(container.querySelector('sup')).toBeInTheDocument()
    expect(screen.getByText('Footnote content here.')).toBeInTheDocument()
  })
})
