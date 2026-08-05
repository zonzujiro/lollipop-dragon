import "./PeerCommentCard.css";
import { useAppStore } from "../../../store";
import type { PeerComment } from "../../../types/share";
import { isCommentType } from "../../../markup/commentProtocol";

function fileBaseName(path: string): string {
  return path.split("/").pop() ?? path;
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
  const showToast = useAppStore((s) => s.showToast);
  const canMerge = comment.path === currentPath;

  function handleNavigate() {
    navigateToBlock(comment.path, comment.blockRef.blockIndex);
  }

  async function handleMerge() {
    const merged = await mergeComment(docId, comment);
    if (!merged) {
      showToast(
        "Comment could not be merged safely. Refresh the file and retry.",
      );
    }
  }

  return (
    <div
      className="peer-card"
      data-comment-type={comment.commentType}
      role="button"
      tabIndex={0}
      onClick={handleNavigate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          handleNavigate();
        }
      }}
      onMouseEnter={() => {
        if (canMerge && isCommentType(comment.commentType)) {
          setHighlight({
            blockIndex: comment.blockRef.blockIndex,
            commentType: comment.commentType,
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
        <span className="peer-card__type">{comment.commentType}</span>
        <span className="peer-card__status">incoming</span>
      </div>

      {comment.blockRef.contentPreview && (
        <blockquote className="peer-card__preview">
          {comment.blockRef.contentPreview}
        </blockquote>
      )}

      <p className="peer-card__text">{comment.text}</p>

      <div
        className="peer-card__actions"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="peer-card__btn peer-card__btn--merge"
          onClick={() => {
            void handleMerge();
          }}
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
