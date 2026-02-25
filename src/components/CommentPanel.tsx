import { useMemo } from 'react'
import { useAppStore } from '../store'
import type { CommentType } from '../types/criticmarkup'

const TYPE_COLOR: Record<CommentType, string> = {
  fix:      'var(--c-red)',
  rewrite:  'var(--c-orange)',
  expand:   'var(--accent)',
  clarify:  'var(--c-purple)',
  question: 'var(--c-cyan)',
  remove:   'var(--text-muted)',
  note:     'var(--c-green)',
}

const ALL_TYPES: CommentType[] = ['fix', 'rewrite', 'expand', 'clarify', 'question', 'remove', 'note']

function scrollToBlock(blockIndex: number | undefined) {
  if (blockIndex === undefined) return
  document
    .querySelector(`[data-block-index="${blockIndex}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

export function CommentPanel() {
  const comments = useAppStore((s) => s.comments)
  const resolvedComments = useAppStore((s) => s.resolvedComments)
  const activeCommentId = useAppStore((s) => s.activeCommentId)
  const commentFilter = useAppStore((s) => s.commentFilter)
  const setActiveCommentId = useAppStore((s) => s.setActiveCommentId)
  const setCommentFilter = useAppStore((s) => s.setCommentFilter)
  const toggleCommentPanel = useAppStore((s) => s.toggleCommentPanel)

  const isResolved = commentFilter === 'resolved'

  // Count per type for current (non-resolved) comments
  const counts = useMemo(() => {
    const c: Partial<Record<CommentType, number>> = {}
    for (const comment of comments) {
      c[comment.type] = (c[comment.type] ?? 0) + 1
    }
    return c
  }, [comments])

  const activeTypes = ALL_TYPES.filter((t) => (counts[t] ?? 0) > 0)

  // Visible list: resolved view shows resolvedComments; otherwise filter current by type
  const visible = isResolved
    ? resolvedComments
    : commentFilter === 'all' || commentFilter === 'pending'
      ? comments
      : comments.filter((c) => c.type === commentFilter)

  function handleEntryClick(id: string, blockIndex: number | undefined) {
    setActiveCommentId(activeCommentId === id ? null : id)
    scrollToBlock(blockIndex)
  }

  function entryLabel(c: typeof comments[number]): string {
    const body = c.text || c.highlightedText || c.from || ''
    return body.length > 72 ? body.slice(0, 72) + '…' : body
  }

  const showTypeFilters = !isResolved && activeTypes.length > 1
  const showStatusFilters = resolvedComments.length > 0

  return (
    <aside className="comment-panel" aria-label="Comments">
      <div className="comment-panel__header">
        <span className="comment-panel__title">
          Comments
          {comments.length > 0 && (
            <span className="comment-panel__count">{comments.length}</span>
          )}
        </span>
        <button
          className="comment-panel__close"
          onClick={toggleCommentPanel}
          aria-label="Close comments panel"
        >
          ×
        </button>
      </div>

      {(showStatusFilters || showTypeFilters) && (
        <div className="comment-panel__filters">
          {showStatusFilters && (
            <>
              <button
                className={`comment-panel__filter${commentFilter === 'all' || commentFilter === 'pending' ? ' comment-panel__filter--active' : ''}`}
                onClick={() => setCommentFilter('all')}
              >
                Pending <span className="comment-panel__filter-count">{comments.length}</span>
              </button>
              <button
                className={`comment-panel__filter${isResolved ? ' comment-panel__filter--active' : ''}`}
                onClick={() => setCommentFilter(isResolved ? 'all' : 'resolved')}
              >
                Resolved <span className="comment-panel__filter-count">{resolvedComments.length}</span>
              </button>
              {showTypeFilters && <div className="comment-panel__filter-sep" aria-hidden="true" />}
            </>
          )}
          {showTypeFilters && (
            <>
              {!showStatusFilters && (
                <button
                  className={`comment-panel__filter${(commentFilter === 'all' || commentFilter === 'pending') ? ' comment-panel__filter--active' : ''}`}
                  onClick={() => setCommentFilter('all')}
                >
                  All <span className="comment-panel__filter-count">{comments.length}</span>
                </button>
              )}
              {activeTypes.map((type) => (
                <button
                  key={type}
                  className={`comment-panel__filter${commentFilter === type ? ' comment-panel__filter--active' : ''}`}
                  style={commentFilter === type ? { borderColor: TYPE_COLOR[type], color: TYPE_COLOR[type] } : {}}
                  onClick={() => setCommentFilter(commentFilter === type ? 'all' : type)}
                >
                  {type} <span className="comment-panel__filter-count">{counts[type]}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}

      <div className="comment-panel__list">
        {visible.length === 0 ? (
          <p className="comment-panel__empty">
            {isResolved
              ? 'No resolved comments.'
              : comments.length === 0
                ? 'No comments in this document.'
                : 'No comments match the filter.'}
          </p>
        ) : (
          visible.map((c) => (
            isResolved ? (
              <div key={c.id} className="comment-panel__entry comment-panel__entry--resolved">
                <span
                  className="comment-panel__badge"
                  style={{ backgroundColor: TYPE_COLOR[c.type], color: '#fff', opacity: 0.6 }}
                >
                  {c.type}
                </span>
                <span className="comment-panel__text comment-panel__text--resolved">
                  {entryLabel(c)}
                </span>
              </div>
            ) : (
              <button
                key={c.id}
                className={`comment-panel__entry${activeCommentId === c.id ? ' comment-panel__entry--active' : ''}`}
                onClick={() => handleEntryClick(c.id, c.blockIndex)}
              >
                <span
                  className="comment-panel__badge"
                  style={{ backgroundColor: TYPE_COLOR[c.type], color: '#fff' }}
                >
                  {c.type}
                </span>
                <span className="comment-panel__text">{entryLabel(c)}</span>
                {c.blockIndex !== undefined && (
                  <span className="comment-panel__ref">¶{c.blockIndex + 1}</span>
                )}
              </button>
            )
          ))
        )}
      </div>
    </aside>
  )
}
