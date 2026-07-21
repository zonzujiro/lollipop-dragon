import { useState } from "react";
import type { Comment, CommentType } from "../../../types/criticmarkup";
import { canEditComment } from "../../../utils/commentPermissions";
import {
  normalizeUserCommentType,
  USER_COMMENT_TYPES,
} from "../../commentTypes";

const EDITABLE_CRITIC_TYPES: Comment["criticType"][] = ["comment", "highlight"];

function getThreadAuthorKind(comment: Comment): "mine" | "external" | "none" {
  if (!comment.thread?.replyTo) {
    return "none";
  }
  return comment.thread.authorLabel === "You" ? "mine" : "external";
}

function getThreadAuthorLabel(comment: Comment): string {
  if (!comment.thread?.replyTo) {
    return comment.thread?.authorLabel ?? "You";
  }
  return (
    comment.thread.authorLabel ?? (comment.type === "answer" ? "Agent" : "You")
  );
}

function getThreadAuthorInitial(
  authorLabel: string,
  authorKind: "mine" | "external" | "none",
): string {
  if (
    authorKind === "external" &&
    /agent|claude|codex|cursor/i.test(authorLabel)
  ) {
    return "A";
  }
  return authorLabel.trim().charAt(0).toUpperCase() || "?";
}

function CommentBody({
  comment,
  inline = false,
}: {
  comment: Comment;
  inline?: boolean;
}) {
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
      {(comment.anchor?.quote || comment.highlightedText) && (
        <p className="comment-thread-card__highlight">
          "{comment.anchor?.quote ?? comment.highlightedText}"
        </p>
      )}
      {comment.anchor?.orphaned && (
        <p className="comment-thread-card__orphan" role="note">
          ⚠ text changed underneath — anchor released, quote kept
        </p>
      )}
      {comment.text &&
        (inline ? (
          <span className="comment-thread-card__content">{comment.text}</span>
        ) : (
          <p className="comment-thread-card__content">{comment.text}</p>
        ))}
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
  const [editType, setEditType] = useState<CommentType>(
    comment.thread || comment.type === "answer"
      ? comment.type
      : normalizeUserCommentType(comment.type),
  );
  const [editText, setEditText] = useState(comment.text);
  const availableTypes =
    comment.thread || comment.type === "answer"
      ? [comment.type]
      : USER_COMMENT_TYPES;

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

function CommentActions({
  editable,
  deleteEnabled,
  busy,
  threadRoot,
  onStartEdit,
  onStartDelete,
}: {
  editable: boolean;
  deleteEnabled: boolean;
  busy: boolean;
  threadRoot: boolean;
  onStartEdit: () => void;
  onStartDelete: () => void;
}) {
  if ((!editable && !deleteEnabled) || busy) {
    return null;
  }

  return (
    <div className="comment-thread-card__actions">
      {editable && (
        <button
          className="comment-thread-card__action"
          onClick={(event) => {
            event.stopPropagation();
            onStartEdit();
          }}
          aria-label="Edit comment"
        >
          Edit
        </button>
      )}
      {deleteEnabled && (
        <button
          className="comment-thread-card__action comment-thread-card__action--delete"
          onClick={(event) => {
            event.stopPropagation();
            onStartDelete();
          }}
          aria-label={threadRoot ? "Resolve question" : "Delete comment"}
        >
          {threadRoot ? "✓ Resolve" : "Delete"}
        </button>
      )}
    </div>
  );
}

function CommentRowContent({
  comment,
  editing,
  confirmingDelete,
  inline,
  onSave,
  onCancelEdit,
  onCancelDelete,
  onConfirmDelete,
}: {
  comment: Comment;
  editing: boolean;
  confirmingDelete: boolean;
  inline: boolean;
  onSave: (type: CommentType, text: string) => void;
  onCancelEdit: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const resolvingThreadRoot = !!comment.thread && !comment.thread.replyTo;
  if (editing) {
    return (
      <CommentEditForm
        comment={comment}
        onSave={onSave}
        onCancel={onCancelEdit}
      />
    );
  }
  if (confirmingDelete) {
    return (
      <div className="comment-thread-card__confirm">
        <p>
          {resolvingThreadRoot
            ? "Resolve this question?"
            : "Delete this comment?"}
        </p>
        <div className="comment-add-form__actions">
          <button
            className="comment-thread-card__confirm-yes"
            onClick={onConfirmDelete}
            aria-label={
              resolvingThreadRoot ? "Confirm resolve" : "Confirm delete"
            }
          >
            {resolvingThreadRoot ? "Resolve" : "Delete"}
          </button>
          <button className="comment-add-form__cancel" onClick={onCancelDelete}>
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return <CommentBody comment={comment} inline={inline} />;
}

export interface CommentThreadRowProps {
  comment: Comment;
  reply: boolean;
  answeredCount: number;
  editEnabled: boolean;
  deleteEnabled: boolean;
  editing: boolean;
  confirmingDelete: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (type: CommentType, text: string) => void;
  onStartDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

export function CommentThreadRow({
  comment,
  reply,
  answeredCount,
  editEnabled,
  deleteEnabled,
  editing,
  confirmingDelete,
  onStartEdit,
  onCancelEdit,
  onSave,
  onStartDelete,
  onCancelDelete,
  onConfirmDelete,
}: CommentThreadRowProps) {
  const editable =
    editEnabled &&
    canEditComment(comment) &&
    EDITABLE_CRITIC_TYPES.includes(comment.criticType);
  const authorLabel = getThreadAuthorLabel(comment);
  const authorKind = getThreadAuthorKind(comment);
  const threadRoot = !!comment.thread && !comment.thread.replyTo;
  const busy = editing || confirmingDelete;
  const actionsEnabled = editable || deleteEnabled;
  const itemClasses = [
    "comment-thread-card__item",
    reply ? "comment-thread-card__item--reply" : "",
    actionsEnabled ? "comment-thread-card__item--actionable" : "",
    authorKind === "mine" ? "comment-thread-card__item--mine" : "",
    authorKind === "external" ? "comment-thread-card__item--external" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const actions = (
    <CommentActions
      editable={editable}
      deleteEnabled={deleteEnabled}
      busy={busy}
      threadRoot={threadRoot}
      onStartEdit={onStartEdit}
      onStartDelete={onStartDelete}
    />
  );

  if (reply) {
    return (
      <div className={itemClasses}>
        <span
          className={`comment-thread-card__avatar comment-thread-card__avatar--${authorKind}`}
          aria-hidden="true"
        >
          {getThreadAuthorInitial(authorLabel, authorKind)}
        </span>
        <div className="comment-thread-card__reply-copy">
          {busy ? (
            <CommentRowContent
              comment={comment}
              editing={editing}
              confirmingDelete={confirmingDelete}
              inline={false}
              onSave={onSave}
              onCancelEdit={onCancelEdit}
              onCancelDelete={onCancelDelete}
              onConfirmDelete={onConfirmDelete}
            />
          ) : (
            <div className="comment-thread-card__reply-line">
              <span className="comment-thread-card__reply-author">
                {authorLabel}
              </span>
              <span aria-hidden="true"> — </span>
              <CommentBody comment={comment} inline />
            </div>
          )}
          {actions}
        </div>
      </div>
    );
  }

  return (
    <div className={itemClasses}>
      <div className="comment-thread-card__item-header">
        <div className="comment-thread-card__meta">
          <span className="comment-thread-card__badge">{comment.type}</span>
          <span className="comment-thread-card__author">{authorLabel}</span>
          {answeredCount > 0 && (
            <span className="comment-thread-card__status">
              ✓ answered · {answeredCount}
            </span>
          )}
        </div>
        {actions}
      </div>
      <CommentRowContent
        comment={comment}
        editing={editing}
        confirmingDelete={confirmingDelete}
        inline={false}
        onSave={onSave}
        onCancelEdit={onCancelEdit}
        onCancelDelete={onCancelDelete}
        onConfirmDelete={onConfirmDelete}
      />
    </div>
  );
}
