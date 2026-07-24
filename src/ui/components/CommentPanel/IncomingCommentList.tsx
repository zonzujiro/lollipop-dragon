import type { PeerComment, ShareRecord } from "../../../types/share";
import { PendingCommentReview } from "../PendingCommentReview";

interface Props {
  pendingComments: Record<string, PeerComment[]>;
  shares: ShareRecord[];
}

export function IncomingCommentList({ pendingComments, shares }: Props) {
  const groups = Object.entries(pendingComments)
    .filter(([, comments]) => comments.length > 0)
    .map(([docId, comments]) => {
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
          <PendingCommentReview docId={group.docId} />
        </section>
      ))}
    </div>
  );
}
