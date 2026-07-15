import type { CommentThreadGroup } from "../../../markup";
import type { CommentType } from "../../../types/criticmarkup";
import type { PeerComment } from "../../../types/share";
import { initials, peerColor } from "../../../utils/peerDisplay";

export interface DotGroup {
  top: number;
  threads: CommentThreadGroup[];
}

function CommentMarker({
  active,
  label,
  onClick,
  type,
}: {
  active: boolean;
  label: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  type: CommentType;
}) {
  return (
    <button
      className={`comment-margin__dot${active ? " comment-margin__dot--active" : ""}`}
      data-comment-type={type}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <span className="comment-margin__dot-mark" aria-hidden="true" />
    </button>
  );
}

function PeerMarker({
  activeId,
  comment,
  peerMode,
  selectComment,
}: {
  activeId: string | null;
  comment: PeerComment;
  peerMode: boolean | undefined;
  selectComment: (commentId: string) => void;
}) {
  if (peerMode) {
    return (
      <CommentMarker
        active={comment.id === activeId}
        type={comment.commentType}
        label={`${comment.commentType}: ${comment.text}`}
        onClick={(event) => {
          event.stopPropagation();
          selectComment(comment.id);
        }}
      />
    );
  }
  return (
    <button
      className="comment-margin__peer-dot"
      style={{ backgroundColor: peerColor(comment.peerName) }}
      title={`${comment.peerName}: ${comment.text}`}
      onClick={(event) => {
        event.stopPropagation();
        document
          .querySelector(`[data-block-index="${comment.blockRef.blockIndex}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
    >
      {initials(comment.peerName)[0]}
    </button>
  );
}

export function CommentMarkers({
  activeId,
  blockTops,
  groups,
  peerDotGroups,
  peerMode,
  selectComment,
}: {
  activeId: string | null;
  blockTops: Map<number, number>;
  groups: DotGroup[];
  peerDotGroups: Map<number, PeerComment[]>;
  peerMode: boolean | undefined;
  selectComment: (commentId: string) => void;
}) {
  const renderedBlocks = new Set(
    groups.flatMap((group) => {
      const blockIndex = group.threads[0]?.root.blockIndex;
      return blockIndex === undefined ? [] : [blockIndex];
    }),
  );

  return (
    <>
      {groups.map(({ top, threads }) => {
        const blockIndex = threads[0]?.root.blockIndex;
        const peerComments =
          blockIndex === undefined ? [] : (peerDotGroups.get(blockIndex) ?? []);
        return (
          <div
            key={`host-${blockIndex ?? top}`}
            className="comment-margin__dots"
            style={{ top }}
          >
            {threads.map((thread) => (
              <CommentMarker
                key={thread.root.id}
                active={
                  thread.root.id === activeId ||
                  thread.replies.some((reply) => reply.id === activeId)
                }
                type={thread.root.type}
                label={`${thread.root.type}: ${thread.root.text}`}
                onClick={(event) => {
                  event.stopPropagation();
                  selectComment(thread.root.id);
                }}
              />
            ))}
            {peerComments.map((comment) => (
              <PeerMarker
                key={comment.id}
                activeId={activeId}
                comment={comment}
                peerMode={peerMode}
                selectComment={selectComment}
              />
            ))}
          </div>
        );
      })}
      {Array.from(peerDotGroups.entries()).map(([blockIndex, comments]) => {
        if (renderedBlocks.has(blockIndex)) {
          return null;
        }
        const top = blockTops.get(blockIndex);
        if (top === undefined) {
          return null;
        }
        return (
          <div
            key={`peer-${blockIndex}`}
            className="comment-margin__dots"
            style={{ top }}
          >
            {comments.map((comment) => (
              <PeerMarker
                key={comment.id}
                activeId={activeId}
                comment={comment}
                peerMode={peerMode}
                selectComment={selectComment}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}
