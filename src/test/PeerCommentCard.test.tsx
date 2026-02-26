import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { PeerCommentCard } from '../components/PeerCommentCard'
import { useAppStore } from '../store'
import type { PeerComment } from '../types/share'

function makePeerComment(overrides: Partial<PeerComment> = {}): PeerComment {
  return {
    id: 'cmt-1',
    peerName: 'Alice',
    path: 'readme.md',
    blockRef: { blockIndex: 0, contentPreview: 'Some preview text' },
    commentType: 'note',
    text: 'This is a peer comment',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  useAppStore.setState({
    mergeComment: vi.fn(),
    dismissComment: vi.fn(),
  })
})

describe('PeerCommentCard — display', () => {
  it('renders peer name, comment type, and text', () => {
    render(<PeerCommentCard docId="doc-1" comment={makePeerComment()} currentPath="readme.md" />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('note')).toBeInTheDocument()
    expect(screen.getByText('This is a peer comment')).toBeInTheDocument()
  })

  it('renders block content preview when provided', () => {
    render(<PeerCommentCard docId="doc-1" comment={makePeerComment()} currentPath="readme.md" />)
    expect(screen.getByText('Some preview text')).toBeInTheDocument()
  })

  it('does not render preview blockquote when contentPreview is empty', () => {
    const comment = makePeerComment({ blockRef: { blockIndex: 0, contentPreview: '' } })
    render(<PeerCommentCard docId="doc-1" comment={comment} currentPath="readme.md" />)
    expect(screen.queryByRole('blockquote')).not.toBeInTheDocument()
  })

  it('shows the file path', () => {
    render(<PeerCommentCard docId="doc-1" comment={makePeerComment()} currentPath="readme.md" />)
    expect(screen.getByText('readme.md')).toBeInTheDocument()
  })
})

describe('PeerCommentCard — merge button', () => {
  it('merge button is enabled when comment.path matches currentPath', () => {
    render(<PeerCommentCard docId="doc-1" comment={makePeerComment({ path: 'readme.md' })} currentPath="readme.md" />)
    expect(screen.getByRole('button', { name: 'Merge' })).toBeEnabled()
  })

  it('merge button is disabled when comment.path differs from currentPath', () => {
    render(<PeerCommentCard docId="doc-1" comment={makePeerComment({ path: 'other.md' })} currentPath="readme.md" />)
    expect(screen.getByRole('button', { name: 'Merge' })).toBeDisabled()
  })

  it('calls mergeComment with docId and comment when merge clicked', async () => {
    const mergeComment = vi.fn()
    useAppStore.setState({ mergeComment })
    const user = userEvent.setup()
    const comment = makePeerComment({ path: 'readme.md' })
    render(<PeerCommentCard docId="doc-1" comment={comment} currentPath="readme.md" />)
    await user.click(screen.getByRole('button', { name: 'Merge' }))
    expect(mergeComment).toHaveBeenCalledWith('doc-1', comment)
  })
})

describe('PeerCommentCard — dismiss button', () => {
  it('calls dismissComment with docId and comment id when clicked', async () => {
    const dismissComment = vi.fn()
    useAppStore.setState({ dismissComment })
    const user = userEvent.setup()
    render(<PeerCommentCard docId="doc-1" comment={makePeerComment({ id: 'cmt-99' })} currentPath="readme.md" />)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(dismissComment).toHaveBeenCalledWith('doc-1', 'cmt-99')
  })
})
