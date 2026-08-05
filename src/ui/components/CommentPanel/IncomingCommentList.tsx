import type { PeerComment, ShareRecord } from "../../../types/share";
import type { SharingTabState } from "../../../modules/sharing";
import { PendingCommentReview } from "../PendingCommentReview";
import { ReviewErrorBoundary } from "../ReviewErrorBoundary";

interface Props {
  pendingComments: Record<string, PeerComment[]>;
  shares: ShareRecord[];
  sessions: SharingTabState["incomingReviewSessions"];
}

export function IncomingCommentList({
  pendingComments,
  shares,
  sessions,
}: Props) {
  const docIds = new Set([
    ...Object.keys(pendingComments),
    ...Object.entries(sessions)
      .filter(([, session]) => session.quarantinedItems.length > 0)
      .map(([docId]) => docId),
  ]);
  const groups = [...docIds]
    .filter(
      (docId) =>
        (pendingComments[docId]?.length ?? 0) > 0 ||
        (sessions[docId]?.quarantinedItems.length ?? 0) > 0,
    )
    .map((docId) => {
      const comments = pendingComments[docId] ?? [];
      const share = shares.find((candidate) => candidate.docId === docId);
      return {
        docId,
        label: share?.label ?? comments[0]?.path ?? "Shared review",
      };
    });

  if (groups.length === 0) {
    return (
      <div className="comment-panel__incoming-empty">
        <strong>You’re caught up</strong>
        <span>There are no incoming review comments.</span>
      </div>
    );
  }

  return (
    <div className="comment-panel__incoming">
      {groups.map((group) => (
        <section
          key={group.docId}
          className="comment-panel__incoming-group"
          aria-label={`Incoming comments for ${group.label}`}
        >
          <h3 title={group.label}>{group.label}</h3>
          <ReviewErrorBoundary
            title="Incoming comments could not be displayed"
            resetKey={pendingComments[group.docId]?.length ?? 0}
          >
            <PendingCommentReview docId={group.docId} />
          </ReviewErrorBoundary>
        </section>
      ))}
    </div>
  );
}
