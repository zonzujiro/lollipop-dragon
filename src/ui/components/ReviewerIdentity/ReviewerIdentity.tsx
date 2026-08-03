import "./ReviewerIdentity.css";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppStore } from "../../../store";
import { initials } from "../../../utils/peerDisplay";

const POPOVER_WIDTH = 304;
const POPOVER_GAP = 8;
const VIEWPORT_PADDING = 8;

interface PopoverPosition {
  left: number;
  top: number;
}

interface Props {
  sharedFileCount: number;
}

function ChevronIcon() {
  return (
    <svg
      className="reviewer-identity__chevron"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m3.5 4.5 2.5 2.5 2.5-2.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ReviewerIdentity({ sharedFileCount }: Props) {
  const peerName = useAppStore((state) => state.peerName);
  const setPeerName = useAppStore((state) => state.setPeerName);
  const [isOpen, setIsOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [popoverPosition, setPopoverPosition] =
    useState<PopoverPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPopoverPosition(null);
      return;
    }

    function updatePopoverPosition() {
      const button = buttonRef.current;
      if (!button) {
        return;
      }

      const buttonRect = button.getBoundingClientRect();
      const popoverWidth = Math.min(
        POPOVER_WIDTH,
        window.innerWidth - VIEWPORT_PADDING * 2,
      );
      const maximumLeft = Math.max(
        VIEWPORT_PADDING,
        window.innerWidth - popoverWidth - VIEWPORT_PADDING,
      );
      const preferredLeft = buttonRect.right - popoverWidth;

      setPopoverPosition({
        left: Math.min(Math.max(preferredLeft, VIEWPORT_PADDING), maximumLeft),
        top: buttonRect.bottom + POPOVER_GAP,
      });
    }

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleMouseDown(event: MouseEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }
      const clickedButton = buttonRef.current?.contains(event.target);
      const clickedPopover = popoverRef.current?.contains(event.target);
      if (!clickedButton && !clickedPopover) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setIsOpen(false);
      buttonRef.current?.focus();
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (!peerName) {
    return null;
  }

  function openPopover() {
    setDraftName(peerName ?? "");
    setIsOpen(true);
  }

  function closePopover() {
    setIsOpen(false);
    buttonRef.current?.focus();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = draftName.trim();
    if (!trimmedName) {
      return;
    }
    setPeerName(trimmedName);
    closePopover();
  }

  const popover =
    isOpen && popoverPosition
      ? createPortal(
          <div
            className="reviewer-identity__popover"
            ref={popoverRef}
            role="dialog"
            aria-labelledby="reviewer-name-title"
            style={popoverPosition}
          >
            <form onSubmit={handleSubmit}>
              <label
                className="reviewer-identity__label"
                id="reviewer-name-title"
                htmlFor="reviewer-name-input"
              >
                Reviewer name
              </label>
              <input
                className="reviewer-identity__input"
                id="reviewer-name-input"
                type="text"
                autoComplete="name"
                autoFocus
                value={draftName}
                onChange={(event) => {
                  setDraftName(event.target.value);
                }}
              />
              <p className="reviewer-identity__help">
                Updates unsent drafts. Submitted comments keep their original
                name.
              </p>
              <div className="reviewer-identity__actions">
                <button
                  className="reviewer-identity__cancel"
                  type="button"
                  onClick={closePopover}
                >
                  Cancel
                </button>
                <button
                  className="reviewer-identity__save"
                  type="submit"
                  disabled={!draftName.trim()}
                >
                  Save
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        className="reviewer-identity"
        type="button"
        title={`Change reviewer name (currently ${peerName})`}
        aria-label={`Change reviewer name. Currently ${peerName}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="reviewer-name-input"
        onClick={() => {
          if (isOpen) {
            closePopover();
            return;
          }
          openPopover();
        }}
      >
        <span className="reviewer-identity__avatar">{initials(peerName)}</span>
        <span className="reviewer-identity__details">
          <strong>{peerName}</strong>
          <small>
            {sharedFileCount} shared {sharedFileCount === 1 ? "file" : "files"}
          </small>
        </span>
        <ChevronIcon />
      </button>
      {popover}
    </>
  );
}
