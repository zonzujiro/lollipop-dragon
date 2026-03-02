import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock MarkdownRenderer — rendering pipeline is tested in MarkdownRenderer.test.tsx
vi.mock('../components/MarkdownRenderer', () => ({
  MarkdownRenderer: () => <div data-testid="markdown-renderer" />,
}))

import App from '../App'
import { useAppStore } from '../store'
import { setTestState, resetTestStore } from './testHelpers'
import type { FileTreeNode } from '../types/fileTree'

function resetStore() {
  resetTestStore()
  setTestState(
    {
      fileHandle: null,
      fileName: null,
      rawContent: '',
      directoryHandle: null,
      directoryName: null,
      fileTree: [],
      activeFilePath: null,
      sidebarOpen: true,
      comments: [],
      resolvedComments: [],
      activeCommentId: null,
      commentPanelOpen: false,
      commentFilter: 'all',
      writeAllowed: true,
    },
    {
      theme: 'light',
      focusMode: false,
    },
  )
  localStorage.clear()
}

const fakeTree: FileTreeNode[] = [
  { kind: 'file', name: 'readme.md', path: 'readme.md', handle: {} as FileSystemFileHandle },
  {
    kind: 'directory',
    name: 'docs',
    path: 'docs',
    children: [
      { kind: 'file', name: 'guide.md', path: 'docs/guide.md', handle: {} as FileSystemFileHandle },
    ],
  },
]

beforeEach(() => {
  document.documentElement.classList.remove('dark')
  resetStore()
  vi.restoreAllMocks()
})

describe('App — no file open', () => {
  it('shows the FilePicker landing screen', () => {
    // Reset to no tabs so FilePicker shows
    resetTestStore()
    render(<App />)
    expect(screen.getByText('MarkReview')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open File' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Folder' })).toBeInTheDocument()
  })

  it('calls openFileInNewTab on the store when the button is clicked', async () => {
    // Reset to no tabs so FilePicker shows
    resetTestStore()
    const user = userEvent.setup()
    const mockOpen = vi.fn()
    useAppStore.setState({ openFileInNewTab: mockOpen })

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Open File' }))

    expect(mockOpen).toHaveBeenCalledOnce()
  })

  it('calls openDirectoryInNewTab on the store when Open Folder is clicked', async () => {
    // Reset to no tabs so FilePicker shows
    resetTestStore()
    const user = userEvent.setup()
    const mockOpen = vi.fn()
    useAppStore.setState({ openDirectoryInNewTab: mockOpen })

    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Open Folder' }))

    expect(mockOpen).toHaveBeenCalledOnce()
  })
})

describe('App — single file open', () => {
  beforeEach(() => {
    setTestState({
      fileHandle: {} as FileSystemFileHandle,
      fileName: 'research.md',
      rawContent: '# Hello\n\nThis is a test.',
    })
  })

  it('shows the header with the file name', () => {
    const { container } = render(<App />)
    const headerFilename = container.querySelector('.app-header__filename')
    expect(headerFilename?.textContent).toBe('research.md')
  })

  it('renders the MarkdownRenderer', () => {
    render(<App />)
    expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument()
  })

  it('shows "Open file" and "Open folder" buttons in the header', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Open file' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open folder' })).toBeInTheDocument()
  })
})

describe('App — folder open', () => {
  beforeEach(() => {
    setTestState({
      directoryHandle: {} as FileSystemDirectoryHandle,
      directoryName: 'my-docs',
      fileTree: fakeTree,
      sidebarOpen: true,
    })
  })

  it('shows the file tree sidebar', () => {
    render(<App />)
    expect(screen.getByRole('complementary')).toBeInTheDocument() // <aside>
  })

  it('shows the directory name in the sidebar header', () => {
    const { container } = render(<App />)
    const sidebarName = container.querySelector('.file-tree-header__name')
    expect(sidebarName?.textContent).toBe('my-docs')
  })

  it('shows an empty state when no file is selected', () => {
    render(<App />)
    expect(screen.getByText(/Select a file from the sidebar/)).toBeInTheDocument()
    expect(screen.queryByTestId('markdown-renderer')).not.toBeInTheDocument()
  })

  it('shows the markdown renderer after a file is selected', () => {
    setTestState({ fileName: 'readme.md', rawContent: '# Hello', activeFilePath: 'readme.md' })
    render(<App />)
    expect(screen.getByTestId('markdown-renderer')).toBeInTheDocument()
    expect(screen.queryByText(/Select a file from the sidebar/)).not.toBeInTheDocument()
  })

  it('shows "my-docs / readme.md" in the header when a file is selected', () => {
    setTestState({ fileName: 'readme.md', activeFilePath: 'readme.md' })
    render(<App />)
    expect(screen.getByText('my-docs / readme.md')).toBeInTheDocument()
  })

  it('shows "Open file" and "Open folder" buttons in folder mode', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Open file' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open folder' })).toBeInTheDocument()
  })

  it('hides the sidebar when sidebar toggle is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('complementary')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }))

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('toggles sidebar with Cmd+B', () => {
    render(<App />)
    expect(screen.getByRole('complementary')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'b', metaKey: true })

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })
})

describe('App — theme toggle', () => {
  beforeEach(() => {
    setTestState(
      {
        fileHandle: {} as FileSystemFileHandle,
        fileName: 'doc.md',
        rawContent: '',
      },
      { theme: 'light' },
    )
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
    setTestState(
      {
        fileHandle: {} as FileSystemFileHandle,
        fileName: 'doc.md',
        rawContent: '',
      },
      { focusMode: false },
    )
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
