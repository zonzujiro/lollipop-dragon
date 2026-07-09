import "./HistoryDropdown.css";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAppStore } from "../../../store";

const MENU_WIDTH = 260;
const MENU_GAP = 4;
const VIEWPORT_PADDING = 8;

interface MenuPosition {
  left: number;
  top: number;
}

function ClockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function formatClosedAt(closedAt: string): string {
  const d = new Date(closedAt);
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  return `${month} ${day}`;
}

export function HistoryDropdown() {
  const history = useAppStore((s) => s.history);
  const isOpen = useAppStore((s) => s.historyDropdownOpen);
  const toggle = useAppStore((s) => s.toggleHistoryDropdown);
  const reopen = useAppStore((s) => s.reopenFromHistory);
  const removeEntry = useAppStore((s) => s.removeHistoryEntry);
  const clearAll = useAppStore((s) => s.clearHistory);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuPosition(null);
      return;
    }

    function updateMenuPosition() {
      const button = buttonRef.current;
      if (!button) {
        return;
      }

      const buttonRect = button.getBoundingClientRect();
      const menuWidth = Math.min(
        MENU_WIDTH,
        window.innerWidth - VIEWPORT_PADDING * 2,
      );
      const maximumLeft = Math.max(
        VIEWPORT_PADDING,
        window.innerWidth - menuWidth - VIEWPORT_PADDING,
      );
      const preferredLeft = buttonRect.right - menuWidth;

      setMenuPosition({
        left: Math.min(Math.max(preferredLeft, VIEWPORT_PADDING), maximumLeft),
        top: buttonRect.bottom + MENU_GAP,
      });
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function handleClick(event: MouseEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }

      const clickedButton = dropdownRef.current?.contains(event.target);
      const clickedMenu = menuRef.current?.contains(event.target);
      if (!clickedButton && !clickedMenu) {
        toggle();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, toggle]);

  if (history.length === 0) {
    return null;
  }

  return (
    <div className="history-dropdown" ref={dropdownRef}>
      <button
        ref={buttonRef}
        className="app-header__btn app-header__btn--icon"
        onClick={toggle}
        aria-label="Recent files"
        title="Recent files"
      >
        <ClockIcon />
      </button>

      {isOpen &&
        menuPosition &&
        createPortal(
          <div
            className="history-dropdown__menu"
            ref={menuRef}
            style={{ left: menuPosition.left, top: menuPosition.top }}
          >
            <div className="history-dropdown__header">Recent</div>
            <ul className="history-dropdown__list">
              {history.map((entry) => (
                <li key={entry.id} className="history-dropdown__item">
                  <button
                    className="history-dropdown__entry"
                    onClick={() => {
                      void reopen(entry.id);
                    }}
                    title={`Reopen ${entry.name}`}
                  >
                    <span className="history-dropdown__icon">
                      {entry.type === "directory"
                        ? "\uD83D\uDCC1"
                        : "\uD83D\uDCC4"}
                    </span>
                    <span className="history-dropdown__info">
                      <span className="history-dropdown__name">
                        {entry.name}
                      </span>
                      <span className="history-dropdown__meta">
                        {formatClosedAt(entry.closedAt)}
                        {entry.hasActiveShares && " \u00B7 shared"}
                      </span>
                    </span>
                  </button>
                  <button
                    className="history-dropdown__remove"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeEntry(entry.id);
                    }}
                    aria-label={`Remove ${entry.name} from history`}
                    title="Remove from history"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <button className="history-dropdown__clear" onClick={clearAll}>
              Clear history
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
