import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { CommentPanel } from '../components/CommentPanel'
import { useAppStore } from '../store'
import { getActiveTab } from '../store/selectors'
import { setTestState, resetTestStore } from './testHelpers'
import type { Comment } from '../types/criticmarkup'

// Re-export makeComment for resolved tests
function makeResolvedComment(id: string, text: string): Comment {
  return {
    id, criticType: 'comment', type: 'fix', text, raw: `{>>fix: ${text}<<}`,
    rawStart: 0, rawEnd: 0, cleanStart: 0, cleanEnd: 0,
  }
}

function makeComment(id: string, type: Comment['type'], text: string, blockIndex = 0): Comment {
  return {
    id,
    criticType: 'comment',
    type,
    text,
    raw: `{>>${text}<<}`,
    rawStart: 0,
    rawEnd: 0,
    cleanStart: 0,
    cleanEnd: 0,
    blockIndex,
  }
}

const comments: Comment[] = [
  makeComment('0', 'fix', 'fix the intro', 0),
  makeComment('1', 'rewrite', 'rewrite paragraph', 1),
  makeComment('2', 'fix', 'another fix', 2),
]

beforeEach(() => {
  resetTestStore()
  setTestState({
    comments: [],
    resolvedComments: [],
    activeCommentId: null,
    commentPanelOpen: true,
    commentFilter: 'all',
  })
  vi.restoreAllMocks()
})

describe('CommentPanel — list rendering', () => {
  it('shows empty state when there are no comments', () => {
    render(<CommentPanel />)
    expect(screen.getByText(/No comments in this document/)).toBeInTheDocument()
  })

  it('shows all comments when filter is "all"', () => {
    setTestState({ comments })
    render(<CommentPanel />)
    expect(screen.getByText('fix the intro')).toBeInTheDocument()
    expect(screen.getByText('rewrite paragraph')).toBeInTheDocument()
    expect(screen.getByText('another fix')).toBeInTheDocument()
  })

  it('shows type badges for each comment', () => {
    setTestState({ comments: [makeComment('0', 'fix', 'some text')] })
    render(<CommentPanel />)
    expect(screen.getByText('fix')).toBeInTheDocument()
  })

  it('shows block ref for each comment', () => {
    setTestState({ comments: [makeComment('0', 'note', 'note', 3)] })
    render(<CommentPanel />)
    expect(screen.getByText('¶4')).toBeInTheDocument()
  })

  it('shows the total comment count', () => {
    setTestState({ comments })
    const { container } = render(<CommentPanel />)
    expect(container.querySelector('.comment-panel__count')?.textContent).toBe('3')
  })
})

describe('CommentPanel — filtering', () => {
  beforeEach(() => {
    setTestState({ comments })
  })

  it('shows filter buttons when multiple types are present', () => {
    render(<CommentPanel />)
    // Filter button accessible names include the count: "All 3", "fix 2", "rewrite 1"
    expect(screen.getByRole('button', { name: /^All\s+\d/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^fix\s+\d/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^rewrite\s+\d/ })).toBeInTheDocument()
  })

  it('filters comments by type when a filter button is clicked', async () => {
    const user = userEvent.setup()
    render(<CommentPanel />)
    await user.click(screen.getByRole('button', { name: /^fix\s+\d/ }))
    expect(screen.getByText('fix the intro')).toBeInTheDocument()
    expect(screen.getByText('another fix')).toBeInTheDocument()
    expect(screen.queryByText('rewrite paragraph')).not.toBeInTheDocument()
  })

  it('shows "no comments match" message when filter yields nothing after store change', async () => {
    // Set filter to 'expand' (no expand comments in the list)
    setTestState({ commentFilter: 'expand' })
    render(<CommentPanel />)
    expect(screen.getByText(/No comments match/)).toBeInTheDocument()
  })

  it('resets to all when clicking an active filter', async () => {
    const user = userEvent.setup()
    setTestState({ commentFilter: 'fix' })
    render(<CommentPanel />)
    await user.click(screen.getAllByRole('button', { name: /^fix/ })[0])
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.commentFilter).toBe('all')
  })
})

describe('CommentPanel — active entry', () => {
  it('marks the active comment entry', () => {
    setTestState({ comments, activeCommentId: '1' })
    const { container } = render(<CommentPanel />)
    const active = container.querySelector('.comment-panel__entry--active')
    expect(active).toBeInTheDocument()
    expect(active?.textContent).toContain('rewrite paragraph')
  })

  it('sets activeCommentId when clicking an entry', async () => {
    const user = userEvent.setup()
    setTestState({ comments })
    render(<CommentPanel />)
    await user.click(screen.getByText('fix the intro'))
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.activeCommentId).toBe('0')
  })

  it('clears activeCommentId when clicking the active entry again', async () => {
    const user = userEvent.setup()
    setTestState({ comments, activeCommentId: '0' })
    render(<CommentPanel />)
    await user.click(screen.getByText('fix the intro'))
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.activeCommentId).toBeNull()
  })
})

describe('CommentPanel — close', () => {
  it('calls toggleCommentPanel when close button is clicked', async () => {
    const user = userEvent.setup()
    const mockToggle = vi.fn()
    useAppStore.setState({ toggleCommentPanel: mockToggle })
    render(<CommentPanel />)
    await user.click(screen.getByRole('button', { name: 'Close comments panel' }))
    expect(mockToggle).toHaveBeenCalledOnce()
  })
})

describe('CommentPanel — resolved filter', () => {
  const resolved = [
    makeResolvedComment('r0', 'already fixed'),
    makeResolvedComment('r1', 'was removed'),
  ]

  it('shows Pending and Resolved buttons when resolvedComments exist', () => {
    setTestState({ resolvedComments: resolved })
    render(<CommentPanel />)
    expect(screen.getByRole('button', { name: /^Pending/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Resolved/ })).toBeInTheDocument()
  })

  it('does not show status filter buttons when resolvedComments is empty', () => {
    render(<CommentPanel />)
    expect(screen.queryByRole('button', { name: /^Pending/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Resolved/ })).not.toBeInTheDocument()
  })

  it('shows resolved comments in the list when Resolved filter is active', () => {
    setTestState({ resolvedComments: resolved, commentFilter: 'resolved' })
    render(<CommentPanel />)
    expect(screen.getByText('already fixed')).toBeInTheDocument()
    expect(screen.getByText('was removed')).toBeInTheDocument()
  })

  it('resolved entries have strikethrough styling', () => {
    setTestState({ resolvedComments: resolved, commentFilter: 'resolved' })
    const { container } = render(<CommentPanel />)
    const resolvedTexts = container.querySelectorAll('.comment-panel__text--resolved')
    expect(resolvedTexts.length).toBe(2)
  })

  it('clicking Resolved sets commentFilter to resolved', async () => {
    const user = userEvent.setup()
    setTestState({ resolvedComments: resolved })
    render(<CommentPanel />)
    await user.click(screen.getByRole('button', { name: /^Resolved/ }))
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.commentFilter).toBe('resolved')
  })

  it('clicking Resolved again resets to all', async () => {
    const user = userEvent.setup()
    setTestState({ resolvedComments: resolved, commentFilter: 'resolved' })
    render(<CommentPanel />)
    await user.click(screen.getByRole('button', { name: /^Resolved/ }))
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.commentFilter).toBe('all')
  })
})
