import './PeerCommentCard.css'
import { useAppStore } from '../../store'
import type { PeerComment } from '../../types/share'

const TYPE_COLORS: Record<string, string> = {
  fix: 'var(--c-red)',
  rewrite: 'var(--c-orange)',
  expand: 'var(--accent)',
  clarify: 'var(--c-purple)',
  question: 'var(--c-cyan)',
  remove: 'var(--text-muted)',
  note: 'var(--c-green)',
}

function fileBaseName(path: string): string {
  return path.split('/').pop() ?? path
}

interface Props {
  docId: string
  comment: PeerComment
  currentPath: string
}

export function PeerCommentCard({ docId, comment, currentPath }: Props) {
  const mergeComment = useAppStore((s) => s.mergeComment)
  const dismissComment = useAppStore((s) => s.dismissComment)
  const navigateToBlock = useAppStore((s) => s.navigateToBlock)
  const canMerge = comment.path === currentPath

  function handleNavigate() {
    navigateToBlock(comment.path, comment.blockRef.blockIndex)
  }

  return (
    <div
      className="peer-card"
      role="button"
      tabIndex={0}
      onClick={handleNavigate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleNavigate()
      }}
    >
      <div className="peer-card__meta">
        <span className="peer-card__peer">{comment.peerName}</span>
        <span className="peer-card__path" title={comment.path}>
          {fileBaseName(comment.path)}
        </span>
        <span
          className="peer-card__type"
          style={{ color: TYPE_COLORS[comment.commentType] ?? 'inherit' }}
        >
          {comment.commentType}
        </span>
      </div>

      {comment.blockRef.contentPreview && (
        <blockquote className="peer-card__preview">
          {comment.blockRef.contentPreview}
        </blockquote>
      )}

      <p className="peer-card__text">{comment.text}</p>

      <div className="peer-card__actions" onClick={(e) => e.stopPropagation()}>
        <button
          className="peer-card__btn peer-card__btn--merge"
          onClick={() => mergeComment(docId, comment)}
          disabled={!canMerge}
          title={canMerge ? 'Insert as CriticMarkup in the current file' : 'Open this file first to merge'}
        >
          Merge
        </button>
        <button
          className="peer-card__btn peer-card__btn--dismiss"
          onClick={() => dismissComment(docId, comment.id)}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
