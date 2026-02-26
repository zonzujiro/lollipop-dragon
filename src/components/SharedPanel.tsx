import { useState } from 'react'
import { useAppStore } from '../store'
import { PendingCommentReview } from './PendingCommentReview'

function formatExpiry(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  if (days > 0) return `Expires in ${days}d ${hours}h`
  return `Expires in ${hours}h`
}

export function SharedPanel() {
  const shares = useAppStore((s) => s.shares)
  const toggleSharedPanel = useAppStore((s) => s.toggleSharedPanel)
  const revokeShare = useAppStore((s) => s.revokeShare)
  const updateShare = useAppStore((s) => s.updateShare)
  const fetchPendingComments = useAppStore((s) => s.fetchPendingComments)
  const pendingComments = useAppStore((s) => s.pendingComments)

  const showToast = useAppStore((s) => s.showToast)

  const [expandedDocId, setExpandedDocId] = useState<string | null>(null)
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null)
  const [updated, setUpdated] = useState<string | null>(null)

  async function handleFetch(docId: string) {
    setLoadingDocId(docId)
    try {
      await fetchPendingComments(docId)
      setExpandedDocId(docId)
    } finally {
      setLoadingDocId(null)
    }
  }

  async function handleUpdate(docId: string) {
    setLoadingDocId(docId)
    try {
      await updateShare(docId)
      setUpdated(docId)
      showToast('Share updated')
      setTimeout(() => setUpdated(null), 2000)
    } finally {
      setLoadingDocId(null)
    }
  }

  return (
    <aside className="shared-panel" aria-label="Shared documents">
      <div className="shared-panel__header">
        <h2 className="shared-panel__title">Shared</h2>
        <button
          className="shared-panel__close"
          onClick={toggleSharedPanel}
          aria-label="Close shared panel"
        >
          ×
        </button>
      </div>

      {shares.length === 0 ? (
        <p className="shared-panel__empty">No active shares. Use the Share button to create one.</p>
      ) : (
        <ul className="shared-panel__list">
          {shares.map((share) => {
            const pending = pendingComments[share.docId] ?? []
            const badge = share.pendingCommentCount
            const isExpanded = expandedDocId === share.docId
            const isLoading = loadingDocId === share.docId

            return (
              <li key={share.docId} className="shared-panel__entry">
                <div className="shared-panel__entry-header">
                  <span className="shared-panel__label">{share.label}</span>
                  {badge > 0 && (
                    <span className="shared-panel__badge" title={`${badge} pending comment${badge !== 1 ? 's' : ''}`}>
                      {badge}
                    </span>
                  )}
                </div>

                <div className="shared-panel__expiry">{formatExpiry(share.expiresAt)}</div>

                <div className="shared-panel__actions">
                  <button
                    className="shared-panel__btn"
                    onClick={() => handleFetch(share.docId)}
                    disabled={isLoading}
                    title="Fetch pending peer comments from the Worker"
                  >
                    {isLoading ? '…' : 'Check comments'}
                    {badge > 0 && !isLoading && ` (${badge})`}
                  </button>

                  <button
                    className="shared-panel__btn"
                    onClick={() => handleUpdate(share.docId)}
                    disabled={isLoading}
                    title="Re-encrypt current file state and update the shared content"
                  >
                    {updated === share.docId ? 'Updated!' : 'Update'}
                  </button>

                  <button
                    className="shared-panel__btn shared-panel__btn--revoke"
                    onClick={() => revokeShare(share.docId)}
                    disabled={isLoading}
                    title="Delete this share from the Worker immediately"
                  >
                    Revoke
                  </button>
                </div>

                {isExpanded && (
                  <div className="shared-panel__comments">
                    {pending.length === 0 && !isLoading
                      ? <p className="shared-panel__no-comments">No pending comments.</p>
                      : <PendingCommentReview docId={share.docId} />
                    }
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
