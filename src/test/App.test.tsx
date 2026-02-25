import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock MarkdownRenderer — rendering pipeline is tested in MarkdownRenderer.test.tsx
vi.mock('../components/MarkdownRenderer', () => ({
  MarkdownRenderer: () => <div data-testid="markdown-renderer" />,
}))

import App from '../App'
import { useAppStore } from '../store'

function resetStore() {
  useAppStore.setState({
    fileHandle: null,
    fileName: null,
    rawContent: '',
    theme: 'light',
    focusMode: false,
  })
  localStorage.clear()
}

beforeEach(() => {
  document.documentElement.classList.remove('dark')
  resetStore()
  vi.restoreAllMocks()
})

describe('App — no file open', () => {
  it('shows the FilePicker landing screen', () => {
    render(<App />)
    expect(screen.getByText('MarkReview')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open File' })).toBeInTheDocument()
  })

  it('calls openFile on the store when the button is clicked', async () => {
    const user = userEvent.setup()
    const mockOpen = vi.fn()
    useAppStore.setState({ openFile: mockOpen })

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Open File' }))

    expect(mockOpen).toHaveBeenCalledOnce()
  })
})

describe('App — file open', () => {
  beforeEach(() => {
    useAppStore.setState({
      fileHandle: {} as FileSystemFileHandle,
      fileName: 'research.md',
      rawContent: '# Hello\n\nThis is a test.',
    })
  })

  it('shows the header with the file name', () => {
    render(<App />)
    expect(screen.getByText('research.md')).toBeInTheDocument()
  })

  it('renders the MarkdownRenderer', () => {
    render(<App />)
    expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument()
  })

  it('shows "Open another file" button in the header', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Open another file' })).toBeInTheDocument()
  })
})

describe('App — theme toggle', () => {
  beforeEach(() => {
    useAppStore.setState({
      fileHandle: {} as FileSystemFileHandle,
      fileName: 'doc.md',
      rawContent: '',
      theme: 'light',
    })
  })

  it('adds dark class to <html> when theme is dark', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(document.documentElement.classList.contains('dark')).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }))

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes dark class when switching back to light', async () => {
    useAppStore.setState({ theme: 'dark' })
    const user = userEvent.setup()
    render(<App />)

    expect(document.documentElement.classList.contains('dark')).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Switch to light mode' }))

    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})

describe('App — focus mode', () => {
  beforeEach(() => {
    useAppStore.setState({
      fileHandle: {} as FileSystemFileHandle,
      fileName: 'doc.md',
      rawContent: '',
      focusMode: false,
    })
  })

  it('hides the header in focus mode', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('banner')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Enter focus mode' }))

    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
  })

  it('shows an exit button in focus mode', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Enter focus mode' }))

    expect(screen.getByRole('button', { name: 'Exit focus mode' })).toBeInTheDocument()
  })

  it('restores the header when exiting focus mode', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Enter focus mode' }))
    await user.click(screen.getByRole('button', { name: 'Exit focus mode' }))

    expect(screen.getByRole('banner')).toBeInTheDocument()
  })
})
