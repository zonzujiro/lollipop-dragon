import './CommentCard.css'
import { useState } from 'react'
import type { Comment, CommentType } from '../types/criticmarkup'

const TYPE_COLOR: Record<CommentType, string> = {
  fix:      'var(--c-red)',
  rewrite:  'var(--c-orange)',
  expand:   'var(--accent)',
  clarify:  'var(--c-purple)',
  question: 'var(--c-cyan)',
  remove:   'var(--text-muted)',
  note:     'var(--c-green)',
}

const COMMENT_TYPES: CommentType[] = ['note', 'fix', 'rewrite', 'expand', 'clarify', 'question', 'remove']

function CardBody({ comment }: { comment: Comment }) {
  if (comment.criticType === 'addition') {
    return <p className="comment-card__content comment-card__content--add">+ {comment.text}</p>
  }
  if (comment.criticType === 'deletion') {
    return <p className="comment-card__content comment-card__content--del">− {comment.text}</p>
  }
  if (comment.criticType === 'substitution') {
    return (
      <div className="comment-card__sub">
        <span className="comment-card__sub-from">{comment.from}</span>
        <span className="comment-card__sub-arrow">→</span>
        <span className="comment-card__sub-to">{comment.to}</span>
      </div>
    )
  }
  // 'comment' or 'highlight'
  return (
    <>
      {comment.highlightedText && (
        <p className="comment-card__highlight">"{comment.highlightedText}"</p>
      )}
      {comment.text && <p className="comment-card__content">{comment.text}</p>}
    </>
  )
}

const EDITABLE_TYPES: Comment['criticType'][] = ['comment', 'highlight']

interface Props {
  comment: Comment
  top: number
  onClose: () => void
  onEdit?: (type: CommentType, text: string) => void
  onDelete?: () => void
}

export function CommentCard({ comment, top, onClose, onEdit, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [editType, setEditType] = useState<CommentType>(comment.type)
  const [editText, setEditText] = useState(comment.text)

  function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!editText.trim()) return
    onEdit?.(editType, editText.trim())
    setEditing(false)
  }

  function handleEditCancel() {
    setEditType(comment.type)
    setEditText(comment.text)
    setEditing(false)
  }

  return (
    <div
      className="comment-card"
      style={{ top }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="comment-card__header">
        <span
          className="comment-card__badge"
          style={{ backgroundColor: TYPE_COLOR[comment.type], color: '#fff' }}
        >
          {comment.type}
        </span>
        <div className="comment-card__actions">
          {!editing && !confirming && onEdit && EDITABLE_TYPES.includes(comment.criticType) && (
            <button
              className="comment-card__edit"
              onClick={() => setEditing(true)}
              aria-label="Edit comment"
            >
              Edit
            </button>
          )}
          {!editing && !confirming && onDelete && (
            <button
              className="comment-card__delete"
              onClick={() => setConfirming(true)}
              aria-label="Delete comment"
            >
              Delete
            </button>
          )}
          <button
            className="comment-card__close"
            onClick={onClose}
            aria-label="Close comment"
          >
            ×
          </button>
        </div>
      </div>

      {confirming && (
        <div className="comment-card__confirm">
          <p>Delete this comment?</p>
          <div className="comment-add-form__actions">
            <button
              className="comment-card__confirm-yes"
              onClick={() => { onDelete?.(); setConfirming(false) }}
              aria-label="Confirm delete"
            >
              Delete
            </button>
            <button
              className="comment-add-form__cancel"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {editing ? (
        <form className="comment-card__edit-form" onSubmit={handleEditSubmit}>
          <div className="comment-add-form__types">
            {COMMENT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={`comment-add-form__type${editType === t ? ' comment-add-form__type--active' : ''}`}
                onClick={() => setEditType(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <textarea
            className="comment-add-form__input"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={3}
            autoFocus
          />
          <div className="comment-add-form__actions">
            <button type="submit" className="comment-add-form__save" disabled={!editText.trim()}>
              Save
            </button>
            <button type="button" className="comment-add-form__cancel" onClick={handleEditCancel}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <CardBody comment={comment} />
      )}
    </div>
  )
}
