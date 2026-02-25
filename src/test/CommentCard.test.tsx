import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { CommentCard } from '../components/CommentCard'
import type { Comment } from '../types/criticmarkup'

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: '0',
    criticType: 'comment',
    type: 'note',
    text: 'test comment',
    raw: '{>>test comment<<}',
    rawStart: 0,
    rawEnd: 18,
    cleanStart: 0,
    cleanEnd: 0,
    ...overrides,
  }
}

describe('CommentCard — type badge', () => {
  it('shows the comment type in the badge', () => {
    render(<CommentCard comment={makeComment({ type: 'fix' })} top={0} onClose={vi.fn()} />)
    expect(screen.getByText('fix')).toBeInTheDocument()
  })

  it('renders a close button', () => {
    render(<CommentCard comment={makeComment()} top={0} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Close comment' })).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<CommentCard comment={makeComment()} top={0} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Close comment' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('CommentCard — content by criticType', () => {
  it('shows comment text for criticType=comment', () => {
    render(<CommentCard comment={makeComment({ text: 'my note' })} top={0} onClose={vi.fn()} />)
    expect(screen.getByText('my note')).toBeInTheDocument()
  })

  it('shows highlighted text and comment body for criticType=highlight', () => {
    render(
      <CommentCard
        comment={makeComment({ criticType: 'highlight', highlightedText: 'the span', text: 'fix this' })}
        top={0}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/"the span"/)).toBeInTheDocument()
    expect(screen.getByText('fix this')).toBeInTheDocument()
  })

  it('shows added text with + prefix for criticType=addition', () => {
    render(
      <CommentCard
        comment={makeComment({ criticType: 'addition', type: 'note', text: 'new content' })}
        top={0}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/\+.*new content/)).toBeInTheDocument()
  })

  it('shows deleted text for criticType=deletion', () => {
    render(
      <CommentCard
        comment={makeComment({ criticType: 'deletion', text: 'old content' })}
        top={0}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/old content/)).toBeInTheDocument()
  })

  it('shows from → to for criticType=substitution', () => {
    render(
      <CommentCard
        comment={makeComment({ criticType: 'substitution', from: 'old', to: 'new', text: 'new' })}
        top={0}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText('old')).toBeInTheDocument()
    expect(screen.getByText('→')).toBeInTheDocument()
    expect(screen.getByText('new')).toBeInTheDocument()
  })
})
