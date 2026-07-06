import "./CommentThreadCard.css";
import { useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { COMMENT_TYPE_COLOR } from "../../../types/criticmarkup";
import type { Comment, CommentType } from "../../../types/criticmarkup";
import type { CommentThreadGroup } from "../../../markup";
import { canEditComment } from "../../../utils/commentPermissions";

const EDITABLE_COMMENT_TYPES: CommentType[] = [
  "note",
  "fix",
  "rewrite",
  "expand",
  "clarify",
  "question",
  "remove",
];

const EDITABLE_CRITIC_TYPES: Comment["criticType"][] = ["comment", "highlight"];
const ACTION_REPLY_TYPES: CommentType[] = [
  "fix",
  "rewrite",
  "expand",
  "clarify",
  "remove",
];

type ThreadComposerMode = "reply" | "action";

function getThreadAuthorKind(comment: Comment): "mine" | "external" | "none" {
  if (!comment.thread?.replyTo) {
    return "none";
  }

  return comment.thread?.authorLabel === "You" ? "mine" : "external";
}

function CommentBody({ comment }: { comment: Comment }) {
  if (comment.criticType === "addition") {
    return (
      <p className="comment-thread-card__content comment-thread-card__content--add">
        + {comment.text}
      </p>
    );
  }
  if (comment.criticType === "deletion") {
    return (
      <p className="comment-thread-card__content comment-thread-card__content--del">
        − {comment.text}
      </p>
    );
  }
  if (comment.criticType === "substitution") {
    return (
      <div className="comment-thread-card__sub">
        <span className="comment-thread-card__sub-from">{comment.from}</span>
        <span className="comment-thread-card__sub-arrow">→</span>
        <span className="comment-thread-card__sub-to">{comment.to}</span>
      </div>
    );
  }

  return (
    <>
      {comment.highlightedText && (
        <p className="comment-thread-card__highlight">
          "{comment.highlightedText}"
        </p>
      )}
      {comment.text && (
        <p className="comment-thread-card__content">{comment.text}</p>
      )}
    </>
  );
}

function CommentEditForm({
  comment,
  onSave,
  onCancel,
}: {
  comment: Comment;
  onSave: (type: CommentType, text: string) => void;
  onCancel: () => void;
}) {
  const [editType, setEditType] = useState<CommentType>(comment.type);
  const [editText, setEditText] = useState(comment.text);
  const availableTypes =
    comment.thread || comment.type === "answer"
      ? [comment.type]
      : EDITABLE_COMMENT_TYPES;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!editText.trim()) {
      return;
    }
    onSave(editType, editText.trim());
  }

  return (
    <form className="comment-thread-card__edit-form" onSubmit={handleSubmit}>
      <div className="comment-add-form__types">
        {availableTypes.map((commentType) => (
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
        rows={3}
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

interface CommentRowProps {
  comment: Comment;
  reply: boolean;
  editing: boolean;
  confirmingDelete: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (type: CommentType, text: string) => void;
  onStartDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

function CommentRow({
  comment,
  reply,
  editing,
  confirmingDelete,
  onStartEdit,
  onCancelEdit,
  onSave,
  onStartDelete,
  onCancelDelete,
  onConfirmDelete,
}: CommentRowProps) {
  const editable =
    canEditComment(comment) &&
    EDITABLE_CRITIC_TYPES.includes(comment.criticType);
  const authorLabel = comment.thread?.replyTo
    ? (comment.thread.authorLabel ??
      (comment.type === "answer" ? "Agent" : null))
    : null;
  const authorKind = getThreadAuthorKind(comment);
  const deletingThreadRoot = !!comment.thread && !comment.thread.replyTo;
  const itemClasses = [
    "comment-thread-card__item",
    reply ? "comment-thread-card__item--reply" : "",
    authorKind === "mine" ? "comment-thread-card__item--mine" : "",
    authorKind === "external" ? "comment-thread-card__item--external" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={itemClasses}>
      <div className="comment-thread-card__item-header">
        <div className="comment-thread-card__meta">
          <span
            className="comment-thread-card__badge"
            style={{ backgroundColor: COMMENT_TYPE_COLOR[comment.type] }}
          >
            {comment.type}
          </span>
          {authorLabel && (
            <span
              className={`comment-thread-card__author comment-thread-card__author--${authorKind}`}
            >
              {authorLabel}
            </span>
          )}
        </div>
        <div className="comment-thread-card__actions">
          {editable && !editing && !confirmingDelete && (
            <button
              className="comment-thread-card__action"
              onClick={onStartEdit}
              aria-label="Edit comment"
            >
              Edit
            </button>
          )}
          {!editing && !confirmingDelete && (
            <button
              className="comment-thread-card__action comment-thread-card__action--delete"
              onClick={onStartDelete}
              aria-label="Delete comment"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <CommentEditForm
          comment={comment}
          onSave={onSave}
          onCancel={onCancelEdit}
        />
      ) : confirmingDelete ? (
        <div className="comment-thread-card__confirm">
          <p>
            {deletingThreadRoot
              ? "Delete this thread?"
              : "Delete this comment?"}
          </p>
          <div className="comment-add-form__actions">
            <button
              className="comment-thread-card__confirm-yes"
              onClick={onConfirmDelete}
              aria-label="Confirm delete"
            >
              Delete
            </button>
            <button
              className="comment-add-form__cancel"
              onClick={onCancelDelete}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <CommentBody comment={comment} />
      )}
    </div>
  );
}

interface Props {
  thread: CommentThreadGroup;
  top: number;
  dragPosition?: { top: number; left: number } | null;
  dragging?: boolean;
  cardRef?: RefObject<HTMLDivElement | null>;
  onDragStart?: (event: React.PointerEvent) => void;
  onClose: () => void;
  onEdit?: (id: string, type: CommentType, text: string) => void;
  onDelete?: (id: string) => void;
  onReply?: (rootCommentId: string, text: string, type: CommentType) => void;
}

export function CommentThreadCard({
  thread,
  top,
  dragPosition = null,
  dragging = false,
  cardRef,
  onDragStart,
  onClose,
  onEdit,
  onDelete,
  onReply,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyMode, setReplyMode] = useState<ThreadComposerMode>("reply");
  const [actionType, setActionType] = useState<CommentType>("remove");
  const comments = [thread.root, ...thread.replies];
  const hasActiveInlineAction = editingId !== null || confirmingId !== null;
  const canReplyToThread =
    thread.root.type === "question" &&
    !!thread.root.thread &&
    !!onReply &&
    !hasActiveInlineAction;
  const cardStyle: CSSProperties = dragPosition
    ? {
        position: "fixed",
        top: dragPosition.top,
        left: dragPosition.left,
      }
    : { top };

  function handleReplySubmit(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    const trimmedText = replyText.trim();
    if (!trimmedText || !onReply) {
      return;
    }
    onReply(
      thread.root.id,
      trimmedText,
      replyMode === "action" ? actionType : "answer",
    );
    setReplyText("");
  }

  return (
    <div
      ref={cardRef}
      className={`comment-thread-card${dragging ? " comment-thread-card--dragging" : ""}`}
      style={cardStyle}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="comment-thread-card__header">
        <div
          className="comment-thread-card__drag-handle"
          onPointerDown={onDragStart}
          title="Drag comment panel"
        >
          <span className="comment-thread-card__title">
            {thread.replies.length > 0 ? "Thread" : "Comment"}
          </span>
        </div>
        <button
          className="comment-thread-card__close"
          onClick={onClose}
          aria-label="Close comment"
        >
          ×
        </button>
      </div>

      <div className="comment-thread-card__list">
        {comments.length === 0 && (
          <p className="comment-thread-card__empty">
            No comments in this thread.
          </p>
        )}
        {comments.map((comment, index) => (
          <CommentRow
            key={comment.id}
            comment={comment}
            reply={index > 0}
            editing={editingId === comment.id}
            confirmingDelete={confirmingId === comment.id}
            onStartEdit={() => {
              setConfirmingId(null);
              setEditingId(comment.id);
            }}
            onCancelEdit={() => setEditingId(null)}
            onSave={(type, text) => {
              onEdit?.(comment.id, type, text);
              setEditingId(null);
            }}
            onStartDelete={() => {
              setEditingId(null);
              setConfirmingId(comment.id);
            }}
            onCancelDelete={() => setConfirmingId(null)}
            onConfirmDelete={() => {
              onDelete?.(comment.id);
              setConfirmingId(null);
            }}
          />
        ))}
      </div>
      {canReplyToThread && (
        <form
          className="comment-thread-card__reply-form"
          onSubmit={handleReplySubmit}
        >
          <div className="comment-thread-card__reply-toolbar">
            <div
              className="comment-thread-card__reply-mode"
              aria-label="Thread response mode"
            >
              <button
                type="button"
                className={`comment-thread-card__reply-mode-button${replyMode === "reply" ? " comment-thread-card__reply-mode-button--active" : ""}`}
                aria-pressed={replyMode === "reply"}
                onClick={() => setReplyMode("reply")}
              >
                Reply
              </button>
              <button
                type="button"
                className={`comment-thread-card__reply-mode-button${replyMode === "action" ? " comment-thread-card__reply-mode-button--active" : ""}`}
                aria-pressed={replyMode === "action"}
                onClick={() => setReplyMode("action")}
              >
                Action
              </button>
            </div>
            {replyMode === "action" && (
              <div
                className="comment-thread-card__action-types"
                aria-label="Action type"
              >
                {ACTION_REPLY_TYPES.map((commentType) => (
                  <button
                    key={commentType}
                    type="button"
                    className={`comment-thread-card__action-type${actionType === commentType ? " comment-thread-card__action-type--active" : ""}`}
                    data-comment-type={commentType}
                    aria-pressed={actionType === commentType}
                    onClick={() => setActionType(commentType)}
                  >
                    {commentType}
                  </button>
                ))}
              </div>
            )}
          </div>
          <textarea
            className="comment-thread-card__reply-input"
            aria-label="Answer text"
            placeholder={
              replyMode === "action"
                ? "Tell agent what to change..."
                : "Write an answer..."
            }
            rows={2}
            value={replyText}
            onChange={(event) => setReplyText(event.target.value)}
          />
          <button
            type="submit"
            className="comment-thread-card__reply-send"
            disabled={!replyText.trim()}
          >
            {replyMode === "action" ? "Apply" : "Send"}
          </button>
        </form>
      )}
    </div>
  );
}
