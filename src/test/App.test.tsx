import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { useAppStore } from '../store'

function resetStore() {
  useAppStore.setState({ fileHandle: null, fileName: null, rawContent: '' })
}

beforeEach(() => {
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

  it('renders the file content as markdown', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Hello' })).toBeInTheDocument()
    expect(screen.getByText('This is a test.')).toBeInTheDocument()
  })

  it('shows "Open another file" button in the header', () => {
    render(<App />)
    expect(
      screen.getByRole('button', { name: 'Open another file' }),
    ).toBeInTheDocument()
  })
})
