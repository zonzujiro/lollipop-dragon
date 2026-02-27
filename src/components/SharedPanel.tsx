import { useState } from "react";
import { useAppStore } from "../store";
import { PendingCommentReview } from "./PendingCommentReview";
import { buildShareUrlFromOrigin } from "../utils/shareUrl";

function formatExpiry(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `Expires in ${days}d ${hours}h`;
  return `Expires in ${hours}h`;
}

function formatCreatedAt(createdAt: string): string {
  const d = new Date(createdAt);
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, "0");
  const mins = d.getMinutes().toString().padStart(2, "0");
  return `${month} ${day}, ${hours}:${mins}`;
}

function formatFileCount(count: number): string {
  return `${count} file${count !== 1 ? "s" : ""}`;
}

export function SharedPanel() {
  const shares = useAppStore((s) => s.shares);
  const toggleSharedPanel = useAppStore((s) => s.toggleSharedPanel);
  const revokeShare = useAppStore((s) => s.revokeShare);
  const fetchPendingComments = useAppStore((s) => s.fetchPendingComments);
  const pendingComments = useAppStore((s) => s.pendingComments);

  const showToast = useAppStore((s) => s.showToast);

  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  async function handleFetch(docId: string) {
    setLoadingDocId(docId);
    try {
      await fetchPendingComments(docId);
      setExpandedDocId(docId);
    } finally {
      setLoadingDocId(null);
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
        <p className="shared-panel__empty">
          No active shares. Use the Share button to create one.
        </p>
      ) : (
        <ul className="shared-panel__list">
          {shares.map((share) => {
            const pending = pendingComments[share.docId] ?? [];
            const badge = share.pendingCommentCount;
            const isExpanded = expandedDocId === share.docId;
            const isLoading = loadingDocId === share.docId;

            return (
              <li key={share.docId} className="shared-panel__entry">
                <div className="shared-panel__entry-header">
                  <span className="shared-panel__label">{share.label}</span>
                  {share.fileCount > 0 && (
                    <span className="shared-panel__file-count">
                      {formatFileCount(share.fileCount)}
                    </span>
                  )}
                  {badge > 0 && (
                    <span
                      className="shared-panel__badge"
                      title={`${badge} pending comment${badge !== 1 ? "s" : ""}`}
                    >
                      {badge}
                    </span>
                  )}
                </div>

                <div className="shared-panel__meta">
                  <span className="shared-panel__created">
                    {formatCreatedAt(share.createdAt)}
                  </span>
                  <span className="shared-panel__expiry">
                    {formatExpiry(share.expiresAt)}
                  </span>
                </div>

                <div className="shared-panel__actions">
                  <button
                    className="shared-panel__btn"
                    onClick={() => {
                      const url = buildShareUrlFromOrigin({
                        docId: share.docId,
                        keyB64: share.keyB64,
                        roomPwd: share.roomPassword,
                      });
                      navigator.clipboard
                        .writeText(url)
                        .then(() => showToast("Link copied"));
                    }}
                    title="Copy share link to clipboard"
                  >
                    Copy link
                  </button>

                  <button
                    className="shared-panel__btn"
                    onClick={() => handleFetch(share.docId)}
                    disabled={isLoading}
                    title="Fetch pending peer comments from the Worker"
                  >
                    {isLoading ? "…" : "Check comments"}
                    {badge > 0 && !isLoading && ` (${badge})`}
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
                    {pending.length === 0 && !isLoading ? (
                      <p className="shared-panel__no-comments">
                        No pending comments.
                      </p>
                    ) : (
                      <PendingCommentReview docId={share.docId} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
