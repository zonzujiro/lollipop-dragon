import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store'
import { CommentCard } from './CommentCard'
import type { Comment, CommentType } from '../types/criticmarkup'

const COMMENT_TYPES: CommentType[] = ['note', 'fix', 'rewrite', 'expand', 'clarify', 'question', 'remove']

interface AddCommentFormProps {
  top: number
  onSubmit: (type: CommentType, text: string) => void
  onCancel: () => void
}

function AddCommentForm({ top, onSubmit, onCancel }: AddCommentFormProps) {
  const [type, setType] = useState<CommentType>('note')
  const [text, setText] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!text.trim()) return
    onSubmit(type, text.trim())
  }

  return (
    <form
      className="comment-add-form"
      style={{ top }}
      onSubmit={handleSubmit}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="comment-add-form__types">
        {COMMENT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={`comment-add-form__type${type === t ? ' comment-add-form__type--active' : ''}`}
            onClick={() => setType(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <textarea
        className="comment-add-form__input"
        placeholder="Add a comment…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        autoFocus
      />
      <div className="comment-add-form__actions">
        <button type="submit" className="comment-add-form__save" disabled={!text.trim()}>
          Save
        </button>
        <button type="button" className="comment-add-form__cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

const TYPE_COLOR: Record<CommentType, string> = {
  fix:      'var(--c-red)',
  rewrite:  'var(--c-orange)',
  expand:   'var(--accent)',
  clarify:  'var(--c-purple)',
  question: 'var(--c-cyan)',
  remove:   'var(--text-muted)',
  note:     'var(--c-green)',
}

interface DotGroup {
  top: number
  comments: Comment[]
}

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>
  hoveredBlock: { index: number; top: number } | null
  onAddComment: (blockIndex: number, type: CommentType, text: string) => void
  peerMode?: boolean
  onPostPeerComment?: (blockIndex: number, type: CommentType, text: string) => void
}

export function CommentMargin({ containerRef, hoveredBlock, onAddComment, peerMode, onPostPeerComment }: Props) {
  const editCommentAction = useAppStore((s) => s.editComment)
  const deleteCommentAction = useAppStore((s) => s.deleteComment)
  const [addingBlock, setAddingBlock] = useState<{ index: number; top: number } | null>(null)
  const allComments = useAppStore((s) => s.comments)
  const commentFilter = useAppStore((s) => s.commentFilter)
  const activeId = useAppStore((s) => s.activeCommentId)
  const setActiveId = useAppStore((s) => s.setActiveCommentId)
  // 'resolved' means the comments are gone from the file — no dots to show.
  // 'pending' is the same as 'all' for current (still-in-file) comments.
  const comments = (commentFilter === 'all' || commentFilter === 'pending' || commentFilter === 'resolved')
    ? (commentFilter === 'resolved' ? [] : allComments)
    : allComments.filter((c) => c.type === commentFilter)
  const [groups, setGroups] = useState<DotGroup[]>([])
  const measureRef = useRef<() => void>(() => {})

  // Close card when clicking outside
  useEffect(() => {
    const onDocClick = () => setActiveId(null)
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [setActiveId])

  useEffect(() => {
    measureRef.current = () => {
      const container = containerRef.current
      if (!container) return

      const byBlock = new Map<number, Comment[]>()
      for (const c of comments) {
        if (c.blockIndex === undefined) continue
        const arr = byBlock.get(c.blockIndex) ?? []
        arr.push(c)
        byBlock.set(c.blockIndex, arr)
      }

      const next: DotGroup[] = []
      const blocks = container.querySelectorAll<HTMLElement>('[data-block-index]')
      for (const el of blocks) {
        const idx = Number(el.getAttribute('data-block-index'))
        const group = byBlock.get(idx)
        if (!group) continue
        next.push({ top: el.offsetTop, comments: group })
      }
      setGroups(next)
    }

    measureRef.current()

    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => measureRef.current())
    ro.observe(container)
    return () => ro.disconnect()
  }, [comments, containerRef])


  return (
    <div className="comment-margin">
      {hoveredBlock && !addingBlock && (
        <div className="comment-margin__add-wrapper" style={{ top: hoveredBlock.top }}>
          <button
            className="comment-margin__add"
            aria-label="Add comment"
            onClick={(e) => {
              e.stopPropagation()
              setAddingBlock(hoveredBlock)
            }}
          >+</button>
        </div>
      )}
      {addingBlock && (
        <AddCommentForm
          top={addingBlock.top}
          onSubmit={(type, text) => {
            if (peerMode && onPostPeerComment) {
              onPostPeerComment(addingBlock.index, type, text)
            } else {
              onAddComment(addingBlock.index, type, text)
            }
            setAddingBlock(null)
          }}
          onCancel={() => setAddingBlock(null)}
        />
      )}
      {groups.map(({ top, comments: groupComments }, i) => {
        const activeComment = groupComments.find((c) => c.id === activeId) ?? null
        return (
          <div key={i}>
            <div className="comment-margin__dots" style={{ top }}>
              {groupComments.map((c) => (
                <button
                  key={c.id}
                  className={`comment-margin__dot${activeId === c.id ? ' comment-margin__dot--active' : ''}`}
                  style={{ backgroundColor: TYPE_COLOR[c.type] }}
                  aria-label={`${c.type}: ${c.text}`}
                  title={`${c.type}: ${c.text}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setActiveId(activeId === c.id ? null : c.id)
                  }}
                />
              ))}
            </div>
            {activeComment && (
              <CommentCard
                comment={activeComment}
                top={top}
                onClose={() => setActiveId(null)}
                onEdit={(type, text) => editCommentAction(activeComment.id, type, text)}
                onDelete={() => { deleteCommentAction(activeComment.id); setActiveId(null) }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
