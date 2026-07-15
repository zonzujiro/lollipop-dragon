import { useState } from "react";
import type {
  CommentAnchorDraft,
  CommentType,
} from "../../../types/criticmarkup";
import {
  DEFAULT_USER_COMMENT_TYPE,
  USER_COMMENT_TYPES,
} from "../../commentTypes";

export interface FloatingCardPosition {
  top: number;
  left: number;
}

const COMMENT_TYPE_HINTS: Record<CommentType, string> = {
  fix: "something is wrong — correct it",
  rewrite: "right idea, wrong words",
  expand: "true but incomplete — go deeper",
  clarify: "ambiguous — make it precise",
  question: "needs an answer, opens a thread",
  answer: "provide a direct answer",
  note: "add context for the reviewer",
  remove: "doesn’t belong — cut it",
};

interface AddCommentFormProps {
  top: number;
  dragPosition?: FloatingCardPosition | null;
  dragging?: boolean;
  formRef?: React.RefObject<HTMLFormElement | null>;
  onDragStart?: (event: React.PointerEvent) => void;
  onSubmit: (type: CommentType, text: string) => void;
  onCancel: () => void;
  disabled?: boolean;
  anchor?: CommentAnchorDraft;
  peerMode?: boolean;
}

export function AddCommentForm({
  top,
  dragPosition = null,
  dragging = false,
  formRef,
  onDragStart,
  onSubmit,
  onCancel,
  disabled = false,
  anchor,
  peerMode = false,
}: AddCommentFormProps) {
  const [type, setType] = useState<CommentType>(DEFAULT_USER_COMMENT_TYPE);
  const [text, setText] = useState("");
  const formStyle: React.CSSProperties = dragPosition
    ? {
        position: "fixed",
        top: dragPosition.top,
        left: dragPosition.left,
      }
    : { top };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!text.trim()) {
      return;
    }
    onSubmit(type, text.trim());
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (text.trim()) {
        onSubmit(type, text.trim());
      }
      return;
    }
    if (event.target instanceof HTMLTextAreaElement) {
      return;
    }
    const typeIndex = Number(event.key) - 1;
    const selectedType = USER_COMMENT_TYPES[typeIndex];
    if (selectedType) {
      event.preventDefault();
      setType(selectedType);
    }
  }

  return (
    <form
      ref={formRef}
      className={`comment-add-form${dragging ? " comment-add-form--dragging" : ""}`}
      data-comment-type={type}
      style={formStyle}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="comment-add-form__drag-handle"
        onPointerDown={onDragStart}
        title="Drag comment panel"
      >
        <span aria-hidden="true" />
      </div>
      {anchor && (
        <blockquote className="comment-add-form__quote">
          “{anchor.quote}”
        </blockquote>
      )}
      <div className="comment-add-form__types">
        {USER_COMMENT_TYPES.map((commentType, index) => (
          <button
            key={commentType}
            type="button"
            className={`comment-add-form__type${type === commentType ? " comment-add-form__type--active" : ""}`}
            data-comment-type={commentType}
            aria-pressed={type === commentType}
            onClick={() => setType(commentType)}
            disabled={disabled}
          >
            {type === commentType && (
              <span
                className="comment-add-form__type-mark"
                aria-hidden="true"
              />
            )}
            {commentType}
            <kbd>{index + 1}</kbd>
          </button>
        ))}
      </div>
      <textarea
        className="comment-add-form__input"
        placeholder={`${COMMENT_TYPE_HINTS[type]}…`}
        aria-label="Comment text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        autoFocus
        disabled={disabled}
      />
      <div className="comment-add-form__actions">
        <span className="comment-add-form__honesty">
          {peerMode
            ? "Sent to the host — encrypted"
            : "Written into the file as CriticMarkup"}
        </span>
        <button
          type="submit"
          className="comment-add-form__save"
          disabled={disabled || !text.trim()}
          aria-label="Save"
        >
          Comment <kbd>⌘↵</kbd>
        </button>
      </div>
    </form>
  );
}
