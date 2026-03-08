import './PendingCommentReview.css'
import { useAppStore } from '../store'
import { useActiveTab } from '../store/selectors'
import { PeerCommentCard } from './PeerCommentCard'

interface Props {
  docId: string
}

export function PendingCommentReview({ docId }: Props) {
  const tab = useActiveTab()
  const pendingComments = tab?.pendingComments ?? {}
  const mergeComment = useAppStore((s) => s.mergeComment)
  const clearPendingComments = useAppStore((s) => s.clearPendingComments)
  const activeFilePath = tab?.activeFilePath ?? null
  const fileName = tab?.fileName ?? null

  const comments = pendingComments[docId] ?? []
  const currentPath = activeFilePath ?? fileName ?? ''

  if (comments.length === 0) {
    return <p className="pending-review__empty">No pending comments.</p>
  }

  async function handleMergeAll() {
    for (const c of comments) {
      await mergeComment(docId, c)
    }
  }

  return (
    <div className="pending-review">
      <div className="pending-review__toolbar">
        <span className="pending-review__count">{comments.length} comment{comments.length !== 1 ? 's' : ''}</span>
        <button
          className="pending-review__btn pending-review__btn--merge-all"
          onClick={handleMergeAll}
        >
          Merge all
        </button>
        <button
          className="pending-review__btn pending-review__btn--clear"
          onClick={() => clearPendingComments(docId)}
        >
          Clear all
        </button>
      </div>

      <div className="pending-review__list">
        {comments.map((c) => (
          <PeerCommentCard key={c.id} docId={docId} comment={c} currentPath={currentPath} />
        ))}
      </div>
    </div>
  )
}
