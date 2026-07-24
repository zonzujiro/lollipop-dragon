import "./CommentThreadCard.css";
import { useEffect, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { CommentThreadGroup } from "../../../markup";
import type { Comment, CommentType } from "../../../types/criticmarkup";
import { canEditComment } from "../../../utils/commentPermissions";
import { USER_COMMENT_TYPES } from "../../commentTypes";
import { CommentThreadRow } from "./CommentThreadRow";

interface Props {
  thread: CommentThreadGroup;
  top: number;
  dragPosition?: { top: number; left: number } | null;
  dragging?: boolean;
  inline?: boolean;
  selected?: boolean;
  cardRef?: RefObject<HTMLDivElement | null>;
  onDragStart?: (event: React.PointerEvent) => void;
  onClose?: () => void;
  onSelect?: () => void;
  onEdit?: (id: string, type: CommentType, text: string) => void;
  onDelete?: (id: string) => void;
  onReply?: (rootCommentId: string, text: string, type: CommentType) => void;
}

export function CommentThreadCard({
  thread,
  top,
  dragPosition = null,
  dragging = false,
  inline = false,
  selected = true,
  cardRef,
  onDragStart,
  onClose,
  onSelect,
  onEdit,
  onDelete,
  onReply,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [selectedActionType, setSelectedActionType] =
    useState<CommentType | null>(null);
  const [threadExpanded, setThreadExpanded] = useState(false);
  const answerCount = thread.replies.filter(
    (reply) => reply.type === "answer",
  ).length;
  const answered = answerCount > 0;
  const editEnabled = !answered && Boolean(onEdit);
  const deleteRepliesEnabled = !answered && Boolean(onDelete);
  const resolveEnabled = Boolean(onDelete);
  const hasActiveInlineAction = editingId !== null || confirmingId !== null;
  const canReplyToThread =
    selected &&
    thread.root.type === "question" &&
    !!thread.root.thread &&
    !!onReply &&
    !hasActiveInlineAction;
  const cardStyle: CSSProperties = inline
    ? {}
    : dragPosition
      ? {
          position: "fixed",
          top: dragPosition.top,
          left: dragPosition.left,
        }
      : { top };
  const longThread = thread.replies.length > 3;
  const collapsedThread = longThread && !threadExpanded;
  const firstReply = thread.replies[0];
  const lastReply = thread.replies[thread.replies.length - 1];

  useEffect(() => {
    if (!answered) {
      return;
    }
    setEditingId(null);
    setConfirmingId((currentId) =>
      currentId === thread.root.id ? currentId : null,
    );
  }, [answered, thread.root.id]);

  function handleReplySubmit(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    submitReply();
  }

  function submitReply() {
    const trimmedText = replyText.trim();
    if (!trimmedText || !onReply) {
      return;
    }
    onReply(thread.root.id, trimmedText, selectedActionType ?? "answer");
    setReplyText("");
  }

  function handleReplyKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    submitReply();
  }

  function toggleActionType(actionType: CommentType) {
    setSelectedActionType((currentType) =>
      currentType === actionType ? null : actionType,
    );
  }

  function renderCommentRow(comment: Comment, reply: boolean) {
    const deleteEnabled = reply
      ? deleteRepliesEnabled && canEditComment(comment)
      : resolveEnabled;
    return (
      <CommentThreadRow
        key={comment.id}
        comment={comment}
        reply={reply}
        answeredCount={reply ? 0 : answerCount}
        editEnabled={editEnabled}
        deleteEnabled={deleteEnabled}
        editing={editEnabled && editingId === comment.id}
        confirmingDelete={deleteEnabled && confirmingId === comment.id}
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
    );
  }

  return (
    <div
      ref={cardRef}
      data-comment-id={thread.root.id}
      data-comment-type={thread.root.type}
      className={`comment-thread-card${inline ? " comment-thread-card--inline" : ""}${inline && selected ? " comment-thread-card--selected" : ""}${inline && !selected ? " comment-thread-card--preview" : ""}${dragging ? " comment-thread-card--dragging" : ""}`}
      style={cardStyle}
      onClick={(event) => {
        event.stopPropagation();
        if (!selected) {
          onSelect?.();
        }
      }}
    >
      {!inline && (
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
      )}

      <div className="comment-thread-card__list">
        {renderCommentRow(thread.root, false)}
        {thread.replies.length > 0 && (
          <div className="comment-thread-card__thread-list">
            {collapsedThread ? (
              <>
                {firstReply && renderCommentRow(firstReply, true)}
                <button
                  type="button"
                  className="comment-thread-card__thread-collapse"
                  onClick={(event) => {
                    event.stopPropagation();
                    setThreadExpanded(true);
                  }}
                >
                  ⌄ {thread.replies.length - 2} more replies
                </button>
                {lastReply && renderCommentRow(lastReply, true)}
              </>
            ) : (
              <>
                {thread.replies.map((reply) => renderCommentRow(reply, true))}
                {longThread && (
                  <button
                    type="button"
                    className="comment-thread-card__thread-collapse"
                    onClick={(event) => {
                      event.stopPropagation();
                      setThreadExpanded(false);
                    }}
                  >
                    ⌃ collapse thread
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {canReplyToThread && (
        <form
          className="comment-thread-card__reply-form"
          onSubmit={handleReplySubmit}
        >
          <div
            className="comment-thread-card__action-types"
            aria-label="Thread action type"
          >
            {USER_COMMENT_TYPES.map((commentType) => (
              <button
                key={commentType}
                type="button"
                className={`comment-thread-card__action-type${selectedActionType === commentType ? " comment-thread-card__action-type--active" : ""}`}
                data-comment-type={commentType}
                aria-pressed={selectedActionType === commentType}
                onClick={() => toggleActionType(commentType)}
              >
                {commentType}
              </button>
            ))}
          </div>
          <div className="comment-thread-card__reply-composer">
            <textarea
              className="comment-thread-card__reply-input"
              aria-label="Answer text"
              placeholder={
                selectedActionType
                  ? "Tell agent what to change..."
                  : "Reply — Enter to send"
              }
              rows={3}
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              onKeyDown={handleReplyKeyDown}
            />
            <button
              type="submit"
              className="comment-thread-card__reply-send"
              aria-label={selectedActionType ? "Apply action" : "Send reply"}
              title={selectedActionType ? "Apply action" : "Send reply"}
              disabled={!replyText.trim()}
            >
              <span aria-hidden="true">↑</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
