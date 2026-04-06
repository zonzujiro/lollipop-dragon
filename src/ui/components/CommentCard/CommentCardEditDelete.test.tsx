import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { CommentCard } from "./index";
import { makeComment } from "../../../test/testHelpers";

const fixDefaults = { type: 'fix' as const, text: 'fix this', raw: '{>>fix: fix this<<}', rawEnd: 19 }

describe('CommentCard — edit button', () => {
  it('shows Edit button for comment criticType when onEdit is provided', () => {
    render(<CommentCard comment={makeComment(fixDefaults)} top={0} onClose={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Edit comment' })).toBeInTheDocument()
  })

  it('shows Edit button for highlight criticType', () => {
    render(
      <CommentCard
        comment={makeComment({ ...fixDefaults, criticType: 'highlight', highlightedText: 'some span' })}
        top={0} onClose={vi.fn()} onEdit={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Edit comment' })).toBeInTheDocument()
  })

  it('does not show Edit button for addition criticType', () => {
    render(
      <CommentCard comment={makeComment({ ...fixDefaults, criticType: 'addition' })} top={0} onClose={vi.fn()} onEdit={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: 'Edit comment' })).not.toBeInTheDocument()
  })

  it('shows inline form with pre-filled type and text on edit click', async () => {
    const user = userEvent.setup()
    render(<CommentCard comment={makeComment(fixDefaults)} top={0} onClose={vi.fn()} onEdit={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Edit comment' }))
    expect(screen.getByDisplayValue('fix this')).toBeInTheDocument()
  })

  it('calls onEdit with updated type and text on save', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<CommentCard comment={makeComment(fixDefaults)} top={0} onClose={vi.fn()} onEdit={onEdit} />)
    await user.click(screen.getByRole('button', { name: 'Edit comment' }))
    const textarea = screen.getByDisplayValue('fix this')
    await user.clear(textarea)
    await user.type(textarea, 'updated text')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onEdit).toHaveBeenCalledWith('fix', 'updated text')
  })

  it('hides form when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<CommentCard comment={makeComment(fixDefaults)} top={0} onClose={vi.fn()} onEdit={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Edit comment' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByDisplayValue('fix this')).not.toBeInTheDocument()
    expect(screen.getByText('fix this')).toBeInTheDocument()
  })
})

describe('CommentCard — delete button', () => {
  it('shows Delete button when onDelete is provided', () => {
    render(<CommentCard comment={makeComment(fixDefaults)} top={0} onClose={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Delete comment' })).toBeInTheDocument()
  })

  it('shows confirmation after clicking Delete', async () => {
    const user = userEvent.setup()
    render(<CommentCard comment={makeComment(fixDefaults)} top={0} onClose={vi.fn()} onDelete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Delete comment' }))
    expect(screen.getByText('Delete this comment?')).toBeInTheDocument()
  })

  it('calls onDelete when confirmation is confirmed', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(<CommentCard comment={makeComment(fixDefaults)} top={0} onClose={vi.fn()} onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: 'Delete comment' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('hides confirmation when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<CommentCard comment={makeComment(fixDefaults)} top={0} onClose={vi.fn()} onDelete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Delete comment' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Delete this comment?')).not.toBeInTheDocument()
  })
})
