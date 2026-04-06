import "./SharedPanel.css";
import { useState } from "react";
import { useAppStore } from "../../store";
import { useActiveTab } from "../../store/selectors";
import { PendingCommentReview } from "../PendingCommentReview";
import { buildShareUrlFromOrigin } from "../../utils/shareUrl";
import { isDocSubscribed } from "../../services/relay";

function formatExpiry(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) {
    return "Expired";
  }
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) {
    return `Expires in ${days}d ${hours}h`;
  }
  return `Expires in ${hours}h`;
}

function formatCreatedAt(createdAt: string): string {
  const date = new Date(createdAt);
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${month} ${day}, ${hours}:${minutes}`;
}

function formatFileCount(count: number): string {
  return `${count} file${count !== 1 ? "s" : ""}`;
}

export function SharedPanel() {
  const tab = useActiveTab();
  const shares = tab?.shares ?? [];
  const toggleSharedPanel = useAppStore((state) => state.toggleSharedPanel);
  const revokeShare = useAppStore((state) => state.revokeShare);
  const pendingComments = tab?.pendingComments ?? {};
  const showToast = useAppStore((state) => state.showToast);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);

  return (
    <aside className="shared-panel" aria-label="Shared documents">
      <div className="shared-panel__header">
        <h2 className="shared-panel__title">Shared</h2>
        <button
          className="shared-panel__close"
          onClick={toggleSharedPanel}
          aria-label="Close shared panel"
        >
          ?
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
            const subscribed = isDocSubscribed(share.docId);
            const canReview = badge > 0 || pending.length > 0;

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
                  {!subscribed && badge > 0 && (
                    <span className="shared-panel__expiry">Relay not connected</span>
                  )}
                </div>

                <div className="shared-panel__actions">
                  <button
                    className="shared-panel__btn"
                    onClick={() => {
                      const url = buildShareUrlFromOrigin({
                        keyB64: share.keyB64,
                        name: share.label,
                      });
                      navigator.clipboard.writeText(url).then(() => {
                        showToast("Link copied");
                      });
                    }}
                    title="Copy share link to clipboard"
                  >
                    Copy link
                  </button>

                  {canReview && (
                    <button
                      className="shared-panel__btn"
                      onClick={() => {
                        setExpandedDocId(
                          isExpanded ? null : share.docId,
                        );
                      }}
                      title="Show pending peer comments for this share"
                    >
                      {isExpanded ? "Hide comments" : "Review comments"}
                    </button>
                  )}

                  <button
                    className="shared-panel__btn shared-panel__btn--revoke"
                    onClick={() => {
                      void revokeShare(share.docId);
                    }}
                    title="Delete this share from the Worker immediately"
                  >
                    Revoke
                  </button>
                </div>

                {isExpanded && (
                  <div className="shared-panel__comments">
                    {pending.length === 0 ? (
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
