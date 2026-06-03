import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { CommentMargin } from "./index";
import { useAppStore } from "../../../store";
import { setTestState, resetTestStore } from "../../../testing/testHelpers";

beforeEach(() => {
  resetTestStore()
  setTestState({
    comments: [],
    commentFilter: 'all',
    activeCommentId: null,
  })
  vi.restoreAllMocks()
})

const fakeContainerRef = { current: null } as React.RefObject<HTMLDivElement | null>

describe('CommentMargin — add button', () => {
  it('shows the add button when hoveredBlock is provided', () => {
    render(
      <CommentMargin
        containerRef={fakeContainerRef}
        hoveredBlock={{ index: 0, top: 0 }}
        onAddComment={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Add comment' })).toBeInTheDocument()
  })

  it('does not show the add button when hoveredBlock is null', () => {
    render(
      <CommentMargin
        containerRef={fakeContainerRef}
        hoveredBlock={null}
        onAddComment={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Add comment' })).not.toBeInTheDocument()
  })

  it('shows the AddCommentForm after clicking the add button', async () => {
    const user = userEvent.setup()
    render(
      <CommentMargin
        containerRef={fakeContainerRef}
        hoveredBlock={{ index: 0, top: 0 }}
        onAddComment={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Add comment' }))
    expect(screen.getByPlaceholderText('Add a comment…')).toBeInTheDocument()
  })

  it('hides the add button while the form is open', async () => {
    const user = userEvent.setup()
    render(
      <CommentMargin
        containerRef={fakeContainerRef}
        hoveredBlock={{ index: 0, top: 0 }}
        onAddComment={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Add comment' }))
    expect(screen.queryByRole('button', { name: 'Add comment' })).not.toBeInTheDocument()
  })

  it('hides the add button in peer mode when content refresh is required', () => {
    useAppStore.setState({ documentUpdateAvailable: true })
    render(
      <CommentMargin
        containerRef={fakeContainerRef}
        hoveredBlock={{ index: 0, top: 0 }}
        onAddComment={vi.fn()}
        peerMode
        onPostPeerComment={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Add comment' })).not.toBeInTheDocument()
  })
})

describe('CommentMargin — AddCommentForm', () => {
  async function openForm(onAddComment = vi.fn()) {
    const user = userEvent.setup()
    render(
      <CommentMargin
        containerRef={fakeContainerRef}
        hoveredBlock={{ index: 2, top: 0 }}
        onAddComment={onAddComment}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Add comment' }))
    return { user, onAddComment }
  }

  it('Save button is disabled when text is empty', async () => {
    await openForm()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('Save button enables after typing text', async () => {
    const { user } = await openForm()
    await user.type(screen.getByPlaceholderText('Add a comment…'), 'hello')
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
  })

  it('calls onAddComment with blockIndex, type, and text on submit', async () => {
    const onAddComment = vi.fn()
    const { user } = await openForm(onAddComment)
    await user.type(screen.getByPlaceholderText('Add a comment…'), 'fix this please')
    // Select 'fix' type
    await user.click(screen.getByRole('button', { name: 'fix' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onAddComment).toHaveBeenCalledWith(2, 'fix', 'fix this please')
  })

  it('defaults to "note" type if no type is selected', async () => {
    const onAddComment = vi.fn()
    const { user } = await openForm(onAddComment)
    await user.type(screen.getByPlaceholderText('Add a comment…'), 'a note')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onAddComment).toHaveBeenCalledWith(2, 'note', 'a note')
  })

  it('hides the form when Cancel is clicked', async () => {
    const { user } = await openForm()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByPlaceholderText('Add a comment…')).not.toBeInTheDocument()
  })

  it('hides the form after successful submit', async () => {
    const { user } = await openForm()
    await user.type(screen.getByPlaceholderText('Add a comment…'), 'done')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.queryByPlaceholderText('Add a comment…')).not.toBeInTheDocument()
  })

  it('disables saving a peer draft after the document becomes stale', async () => {
    const user = userEvent.setup()
    useAppStore.setState({ isPeerMode: true })
    const { rerender } = render(
      <CommentMargin
        containerRef={fakeContainerRef}
        hoveredBlock={{ index: 2, top: 0 }}
        onAddComment={vi.fn()}
        peerMode
        onPostPeerComment={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Add comment' }))
    await user.type(screen.getByPlaceholderText('Add a comment…'), 'draft')

    useAppStore.setState({ documentUpdateAvailable: true })
    rerender(
      <CommentMargin
        containerRef={fakeContainerRef}
        hoveredBlock={{ index: 2, top: 0 }}
        onAddComment={vi.fn()}
        peerMode
        onPostPeerComment={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
