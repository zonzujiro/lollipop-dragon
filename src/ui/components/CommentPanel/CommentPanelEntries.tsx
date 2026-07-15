import { useState } from "react";
import { useAppStore } from "../../../store";
import type { Comment, CommentType } from "../../../types/criticmarkup";
import { canEditComment } from "../../../utils/commentPermissions";
import {
  normalizeUserCommentType,
  USER_COMMENT_TYPES,
} from "../../commentTypes";

const EDITABLE_CRITIC_TYPES: Comment["criticType"][] = ["comment", "highlight"];
const EMPTY_ANSWERED_COMMENT_IDS = new Set<string>();

interface DisplayComment {
  id: string;
  type: CommentType;
  text: string;
  blockIndex: number | undefined;
  quote: string | undefined;
  authorLabel: string;
  createdAt: string;
}

function formatRelativeTime(createdAt: string): string {
  const elapsedMilliseconds = Date.now() - new Date(createdAt).getTime();
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMilliseconds / 60000));
  if (elapsedMinutes < 1) {
    return "now";
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours} h`;
  }
  return `${Math.floor(elapsedHours / 24)} d`;
}

// ── Inline edit/delete state per entry ─────────────────────────────

function InlineEditForm({
  comment,
  onSave,
  onCancel,
}: {
  comment: { type: CommentType; text: string };
  onSave: (type: CommentType, text: string) => void;
  onCancel: () => void;
}) {
  const [editType, setEditType] = useState<CommentType>(
    normalizeUserCommentType(comment.type),
  );
  const [editText, setEditText] = useState(comment.text);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!editText.trim()) {
      return;
    }
    onSave(editType, editText.trim());
  }

  return (
    <form
      className="comment-panel__inline-edit"
      onSubmit={handleSubmit}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="comment-add-form__types">
        {USER_COMMENT_TYPES.map((commentType) => (
          <button
            key={commentType}
            type="button"
            className={`comment-add-form__type${editType === commentType ? " comment-add-form__type--active" : ""}`}
            data-comment-type={commentType}
            aria-pressed={editType === commentType}
            onClick={() => setEditType(commentType)}
          >
            {commentType}
          </button>
        ))}
      </div>
      <textarea
        className="comment-add-form__input"
        aria-label="Comment text"
        value={editText}
        onChange={(event) => setEditText(event.target.value)}
        rows={2}
        autoFocus
      />
      <div className="comment-add-form__actions">
        <button
          type="submit"
          className="comment-add-form__save"
          disabled={!editText.trim()}
        >
          Save
        </button>
        <button
          type="button"
          className="comment-add-form__cancel"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function InlineDeleteConfirm({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="comment-panel__inline-confirm"
      onClick={(event) => event.stopPropagation()}
    >
      <span>Delete this comment?</span>
      <div className="comment-add-form__actions">
        <button className="comment-card__confirm-yes" onClick={onConfirm}>
          Delete
        </button>
        <button className="comment-add-form__cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Entry with actions ─────────────────────────────────────────────

function CommentEntry({
  comment,
  isActive,
  isOtherFile,
  canEdit,
  answered,
  resolved = false,
  onClick,
  onEdit,
  onDelete,
}: {
  comment: Comment | DisplayComment;
  isActive: boolean;
  isOtherFile: boolean;
  canEdit: boolean;
  answered: boolean;
  resolved?: boolean;
  onClick: () => void;
  onEdit?: (id: string, type: CommentType, text: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const setHighlight = useAppStore((state) => state.setHoveredBlockHighlight);

  const isFullComment = "criticType" in comment;
  const label =
    comment.text ||
    (isFullComment ? comment.highlightedText : undefined) ||
    (isFullComment ? comment.from : undefined) ||
    "";
  const displayText = label.length > 72 ? label.slice(0, 72) + "…" : label;
  const quote = isFullComment
    ? (comment.anchor?.quote ?? comment.highlightedText)
    : comment.quote;
  const displayQuote =
    quote && quote.length > 72 ? quote.slice(0, 72) + "…" : quote;
  const isEditable =
    canEdit &&
    (!isFullComment ||
      !comment.criticType ||
      (canEditComment(comment) &&
        EDITABLE_CRITIC_TYPES.includes(comment.criticType)));

  if (editing) {
    return (
      <div className="comment-panel__entry comment-panel__entry--editing">
        <InlineEditForm
          comment={comment}
          onSave={(type, text) => {
            onEdit?.(comment.id, type, text);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="comment-panel__entry comment-panel__entry--editing">
        <InlineDeleteConfirm
          onConfirm={() => {
            onDelete?.(comment.id);
            setConfirming(false);
          }}
          onCancel={() => setConfirming(false)}
        />
      </div>
    );
  }

  return (
    <div
      data-comment-id={comment.id}
      data-comment-type={comment.type}
      role="button"
      tabIndex={0}
      className={`comment-panel__entry${isActive ? " comment-panel__entry--active" : ""}${isOtherFile ? " comment-panel__entry--other-file" : ""}${resolved ? " comment-panel__entry--resolved" : ""}${canEdit ? " comment-panel__entry--actionable" : ""}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          onClick();
        }
      }}
      onMouseEnter={() => {
        if (!isOtherFile && comment.blockIndex !== undefined) {
          setHighlight({
            blockIndex: comment.blockIndex,
            commentType: comment.type,
            commentId: comment.id,
          });
        }
      }}
      onMouseLeave={() => setHighlight(null)}
    >
      <span className="comment-panel__badge">{comment.type}</span>
      <span className="comment-panel__author">
        {isFullComment
          ? (comment.thread?.authorLabel ?? "You")
          : comment.authorLabel}
      </span>
      {!isFullComment && (
        <span className="comment-panel__time">
          {formatRelativeTime(comment.createdAt)}
        </span>
      )}
      {answered && (
        <span
          className="comment-panel__status"
          title="This question has an answer"
        >
          answered
        </span>
      )}
      {resolved && <span className="comment-panel__status">resolved</span>}
      {canEdit && (
        <span
          className="comment-panel__entry-actions"
          onClick={(event) => event.stopPropagation()}
        >
          {isEditable && (
            <button
              className="comment-panel__entry-edit"
              onClick={() => setEditing(true)}
              aria-label="Edit comment"
            >
              ✎ Edit
            </button>
          )}
          <button
            className="comment-panel__entry-resolve"
            onClick={(event) => {
              event.stopPropagation();
              onDelete?.(comment.id);
            }}
            aria-label="Resolve comment"
          >
            ✓ Resolve
          </button>
        </span>
      )}
      {displayQuote && (
        <span className="comment-panel__quote">“{displayQuote}”</span>
      )}
      <span className="comment-panel__text">{displayText}</span>
      {isFullComment && comment.anchor?.orphaned ? (
        <span className="comment-panel__orphan">
          ⚠ text changed underneath — anchor released, quote kept
        </span>
      ) : null}
    </div>
  );
}

// ── Cross-file list ────────────────────────────────────────────────

export function CrossFileList({
  entries,
  activeFilePath,
  activeCommentId,
  onEntryClick,
  onCrossFileClick,
  onEdit,
  onDelete,
  answeredCommentIdsByPath,
}: {
  entries: {
    filePath: string;
    fileName: string;
    comments: (Comment | DisplayComment)[];
  }[];
  activeFilePath: string | null;
  activeCommentId: string | null;
  onEntryClick: (id: string, blockIndex: number | undefined) => void;
  onCrossFileClick: (filePath: string, rawStart: number) => void;
  onEdit: (id: string, type: CommentType, text: string) => void;
  onDelete: (id: string) => void;
  answeredCommentIdsByPath: ReadonlyMap<string, ReadonlySet<string>>;
}) {
  const totalCount = entries.reduce(
    (sum, entry) => sum + entry.comments.length,
    0,
  );

  if (totalCount === 0) {
    return <p className="comment-panel__empty">No comments across files.</p>;
  }

  return (
    <>
      {entries.map((entry) => {
        const isActiveFile = entry.filePath === activeFilePath;
        return (
          <div key={entry.filePath}>
            <div className="comment-panel__file-header">
              <span className="comment-panel__file-name" title={entry.filePath}>
                {entry.filePath}
              </span>
              <span className="comment-panel__file-count">
                {entry.comments.length}
              </span>
            </div>
            {entry.comments.map((comment) => {
              const rawStart = "rawStart" in comment ? comment.rawStart : 0;
              const canEdit = true;
              const answeredCommentIds =
                answeredCommentIdsByPath.get(entry.filePath) ??
                EMPTY_ANSWERED_COMMENT_IDS;
              return (
                <CommentEntry
                  key={`${entry.filePath}:${comment.id}`}
                  comment={comment}
                  isActive={isActiveFile && activeCommentId === comment.id}
                  isOtherFile={!isActiveFile}
                  canEdit={canEdit}
                  answered={answeredCommentIds.has(comment.id)}
                  onClick={() => {
                    if (isActiveFile) {
                      onEntryClick(comment.id, comment.blockIndex);
                    } else {
                      onCrossFileClick(entry.filePath, rawStart);
                    }
                  }}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              );
            })}
          </div>
        );
      })}
    </>
  );
}

// ── Single-file list ───────────────────────────────────────────────

export function SingleFileList({
  visible,
  peerMode,
  activeCommentId,
  sourceComments,
  onEntryClick,
  onEdit,
  onDelete,
  answeredCommentIds,
  resolvedView = false,
}: {
  visible: (Comment | DisplayComment)[];
  peerMode: boolean;
  activeCommentId: string | null;
  sourceComments: (Comment | DisplayComment)[];
  onEntryClick: (id: string, blockIndex: number | undefined) => void;
  onEdit: (id: string, type: CommentType, text: string) => void;
  onDelete: (id: string) => void;
  answeredCommentIds: ReadonlySet<string>;
  resolvedView?: boolean;
}) {
  if (visible.length === 0) {
    return (
      <p className="comment-panel__empty">
        {sourceComments.length === 0
          ? peerMode
            ? "No comments yet."
            : "No comments in this document."
          : "No comments match the filter."}
      </p>
    );
  }

  return (
    <>
      {visible.map((comment) => (
        <CommentEntry
          key={comment.id}
          comment={comment}
          isActive={activeCommentId === comment.id}
          isOtherFile={false}
          canEdit={!resolvedView}
          resolved={resolvedView}
          answered={answeredCommentIds.has(comment.id)}
          onClick={() => onEntryClick(comment.id, comment.blockIndex)}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </>
  );
}
