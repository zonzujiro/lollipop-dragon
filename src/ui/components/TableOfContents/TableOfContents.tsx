import "./TableOfContents.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../../store";
import { useActiveTab } from "../../../store/selectors";
import { parseCriticMarkup, parseMarkdownFrontmatter } from "../../../markup";
import { extractHeadings } from "../../../utils/extractHeadings";

function OutlineIcon() {
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
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function scrollToBlock(blockIndex: number) {
  const el = document.querySelector(`[data-block-index="${blockIndex}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

interface Props {
  peerMode?: boolean;
}

interface MenuPosition {
  top: number;
  right: number;
}

export function TableOfContents({ peerMode = false }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const tab = useActiveTab();
  const peerRawContent = useAppStore((s) => s.peerRawContent);

  const rawContent = peerMode ? peerRawContent : (tab?.rawContent ?? "");

  const headings = useMemo(() => {
    if (!rawContent) {
      return [];
    }
    const document = parseMarkdownFrontmatter(rawContent);
    const { cleanMarkdown } = parseCriticMarkup(document.body);
    return extractHeadings(cleanMarkdown);
  }, [rawContent]);

  const disabled = headings.length === 0;

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }
    const rect = button.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function handleClick(e: MouseEvent) {
      const targetNode = e.target;
      if (
        targetNode instanceof Node &&
        dropdownRef.current?.contains(targetNode)
      ) {
        return;
      }
      if (targetNode instanceof Node) {
        setIsOpen(false);
      }
    }
    updateMenuPosition();
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen, updateMenuPosition]);

  function handleHeadingClick(blockIndex: number) {
    scrollToBlock(blockIndex);
    setIsOpen(false);
  }

  return (
    <div className="toc" ref={dropdownRef}>
      <button
        ref={buttonRef}
        className="app-header__btn app-header__btn--icon"
        onClick={() => {
          if (!isOpen) {
            updateMenuPosition();
          }
          setIsOpen(!isOpen);
        }}
        disabled={disabled}
        aria-label="Table of contents"
        title={disabled ? "No headings in this document" : "Table of contents"}
      >
        <OutlineIcon />
      </button>

      {isOpen && (
        <div
          className="toc__menu"
          style={{ position: "fixed", ...(menuPosition ?? {}) }}
        >
          <div className="toc__header">Contents</div>
          <ul className="toc__list">
            {headings.map((heading, i) => (
              <li key={i} className="toc__item">
                <button
                  className="toc__entry"
                  data-level={heading.level}
                  onClick={() => handleHeadingClick(heading.blockIndex)}
                >
                  {heading.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
