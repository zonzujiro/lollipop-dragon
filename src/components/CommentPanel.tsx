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

interface DisplayComment {
  id: string
  type: CommentType
  text: string
  blockIndex: number | undefined
}

interface Props {
  peerMode?: boolean
}

export function CommentPanel({ peerMode = false }: Props) {
  const comments = useAppStore((s) => s.comments)
  const resolvedComments = useAppStore((s) => s.resolvedComments)
  const activeCommentId = useAppStore((s) => s.activeCommentId)
  const commentFilter = useAppStore((s) => s.commentFilter)
  const setActiveCommentId = useAppStore((s) => s.setActiveCommentId)
  const setCommentFilter = useAppStore((s) => s.setCommentFilter)
  const toggleCommentPanel = useAppStore((s) => s.toggleCommentPanel)
  const myPeerComments = useAppStore((s) => s.myPeerComments)
  const activeFilePath = useAppStore((s) => s.activeFilePath)

  // In peer mode, map PeerComment[] to a unified display shape
  const peerDisplayComments: DisplayComment[] = useMemo(() => {
    if (!peerMode) return []
    return myPeerComments
      .filter((c) => c.path === activeFilePath)
      .map((c) => ({
        id: c.id,
        type: c.commentType,
        text: c.text,
        blockIndex: c.blockRef.blockIndex,
      }))
  }, [peerMode, myPeerComments, activeFilePath])

  const sourceComments = peerMode ? peerDisplayComments : comments

  const isResolved = !peerMode && commentFilter === 'resolved'

  // Count per type
  const counts = useMemo(() => {
    const c: Partial<Record<CommentType, number>> = {}
    for (const comment of sourceComments) {
      c[comment.type] = (c[comment.type] ?? 0) + 1
    }
    return c
  }, [sourceComments])

  const activeTypes = ALL_TYPES.filter((t) => (counts[t] ?? 0) > 0)

  // Visible list: resolved view shows resolvedComments; otherwise filter current by type
  const visible = isResolved
    ? resolvedComments
    : commentFilter === 'all' || commentFilter === 'pending'
      ? sourceComments
      : sourceComments.filter((c) => c.type === commentFilter)

  function handleEntryClick(id: string, blockIndex: number | undefined) {
    setActiveCommentId(activeCommentId === id ? null : id)
    scrollToBlock(blockIndex)
  }

  function entryLabel(c: DisplayComment): string {
    const body = c.text || ''
    return body.length > 72 ? body.slice(0, 72) + '…' : body
  }

  function hostEntryLabel(c: typeof comments[number]): string {
    const body = c.text || c.highlightedText || c.from || ''
    return body.length > 72 ? body.slice(0, 72) + '…' : body
  }

  const showTypeFilters = !isResolved && activeTypes.length > 1
  const showStatusFilters = !peerMode && resolvedComments.length > 0

  return (
    <aside className="comment-panel" aria-label="Comments">
      <div className="comment-panel__header">
        <span className="comment-panel__title">
          Comments
          {sourceComments.length > 0 && (
            <span className="comment-panel__count">{sourceComments.length}</span>
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
                Pending <span className="comment-panel__filter-count">{sourceComments.length}</span>
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
                  All <span className="comment-panel__filter-count">{sourceComments.length}</span>
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
              : sourceComments.length === 0
                ? (peerMode ? 'No comments yet.' : 'No comments in this document.')
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
                  {peerMode ? entryLabel(c) : hostEntryLabel(c as typeof comments[number])}
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
                <span className="comment-panel__text">
                  {peerMode ? entryLabel(c) : hostEntryLabel(c as typeof comments[number])}
                </span>
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
