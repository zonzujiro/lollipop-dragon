import "./PeerCommentCard.css";
import { useAppStore } from "../../../store";
import { COMMENT_TYPE_COLOR } from "../../../types/criticmarkup";
import type { CommentType } from "../../../types/criticmarkup";
import type { PeerComment } from "../../../types/share";

function fileBaseName(path: string): string {
  return path.split("/").pop() ?? path;
}

function commentTypeColor(type: string): string {
  if (type in COMMENT_TYPE_COLOR) {
    return COMMENT_TYPE_COLOR[type as CommentType];
  }
  return "inherit";
}

interface Props {
  docId: string;
  comment: PeerComment;
  currentPath: string;
}

export function PeerCommentCard({ docId, comment, currentPath }: Props) {
  const mergeComment = useAppStore((s) => s.mergeComment);
  const dismissComment = useAppStore((s) => s.dismissComment);
  const navigateToBlock = useAppStore((s) => s.navigateToBlock);
  const setHighlight = useAppStore((s) => s.setHoveredBlockHighlight);
  const canMerge = comment.path === currentPath;

  function handleNavigate() {
    navigateToBlock(comment.path, comment.blockRef.blockIndex);
  }

  return (
    <div
      className="peer-card"
      role="button"
      tabIndex={0}
      onClick={handleNavigate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          handleNavigate();
        }
      }}
      onMouseEnter={() => {
        if (canMerge && comment.commentType in COMMENT_TYPE_COLOR) {
          setHighlight({
            blockIndex: comment.blockRef.blockIndex,
            commentType: comment.commentType as CommentType,
          });
        }
      }}
      onMouseLeave={() => setHighlight(null)}
    >
      <div className="peer-card__meta">
        <span className="peer-card__peer">{comment.peerName}</span>
        <span className="peer-card__path" title={comment.path}>
          {fileBaseName(comment.path)}
        </span>
        <span
          className="peer-card__type"
          style={{ color: commentTypeColor(comment.commentType) }}
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
          title={
            canMerge
              ? "Insert as CriticMarkup in the current file"
              : "Open this file first to merge"
          }
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
  );
}
