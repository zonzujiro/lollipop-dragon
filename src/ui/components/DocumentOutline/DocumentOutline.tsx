import "./DocumentOutline.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../../store";
import { useActiveTab } from "../../../store/selectors";
import { parseCriticMarkup, parseMarkdownFrontmatter } from "../../../markup";
import { extractHeadings } from "../../../utils/extractHeadings";

interface Props {
  peerMode?: boolean;
}

const ACTIVE_SCROLL_OFFSET = 100;

function OutlineIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M4 6h10M4 12h16M4 18h13" />
      <circle cx="19" cy="6" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function findScrollArea(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".markdown-scroll-area");
}

// Header trigger (an obvious button, always in the same place) opening the
// contents panel: headings by level, the section you're reading marked, and
// per-section open-comment counts — the ToC doubles as a review map.
export function DocumentOutline({ peerMode = false }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const tab = useActiveTab();
  const peerRawContent = useAppStore((s) => s.peerRawContent);
  const peerActiveFilePath = useAppStore((s) => s.peerActiveFilePath);
  const myPeerComments = useAppStore((s) => s.myPeerComments);

  const rawContent = peerMode ? peerRawContent : (tab?.rawContent ?? "");

  const headings = useMemo(() => {
    if (!rawContent) {
      return [];
    }
    const document = parseMarkdownFrontmatter(rawContent);
    const { cleanMarkdown } = parseCriticMarkup(document.body);
    return extractHeadings(cleanMarkdown);
  }, [rawContent]);

  const commentBlockIndices = useMemo(() => {
    if (peerMode) {
      return myPeerComments
        .filter((comment) => comment.path === peerActiveFilePath)
        .map((comment) => comment.blockRef.blockIndex);
    }
    return (tab?.comments ?? [])
      .map((comment) => comment.blockIndex)
      .filter((blockIndex): blockIndex is number => blockIndex !== undefined);
  }, [myPeerComments, peerActiveFilePath, peerMode, tab?.comments]);

  const sectionCounts = useMemo(
    () =>
      headings.map((heading, index) => {
        const sectionStart = heading.blockIndex;
        const sectionEnd = headings[index + 1]?.blockIndex ?? Infinity;
        return commentBlockIndices.filter(
          (blockIndex) => blockIndex >= sectionStart && blockIndex < sectionEnd,
        ).length;
      }),
    [commentBlockIndices, headings],
  );

  const updateActiveSection = useCallback(() => {
    const scrollArea = findScrollArea();
    if (!scrollArea) {
      setActiveIndex(0);
      return;
    }
    const threshold = scrollArea.scrollTop + ACTIVE_SCROLL_OFFSET;
    let nextActive = 0;
    for (let index = 0; index < headings.length; index += 1) {
      const block = scrollArea.querySelector<HTMLElement>(
        `[data-block-index="${headings[index].blockIndex}"]`,
      );
      if (block && block.offsetTop <= threshold) {
        nextActive = index;
      }
    }
    setActiveIndex(nextActive);
  }, [headings]);

  // Close on click outside / Escape; keep the active marker fresh while open
  useEffect(() => {
    if (!open) {
      return;
    }
    updateActiveSection();
    function handleMouseDown(event: MouseEvent) {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, updateActiveSection]);

  const jumpToSection = useCallback(
    (index: number) => {
      const heading = headings[index];
      if (!heading) {
        return;
      }
      const root = findScrollArea() ?? document;
      root
        .querySelector(`[data-block-index="${heading.blockIndex}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveIndex(index);
      setOpen(false);
    },
    [headings],
  );

  const disabled = headings.length === 0;

  return (
    <div className="document-outline" ref={rootRef}>
      <button
        className={`app-header__btn app-header__btn--icon${open ? " app-header__btn--active" : ""}`}
        onClick={() => setOpen(!open)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Table of contents"
        title={disabled ? "No headings in this document" : "Table of contents"}
      >
        <OutlineIcon />
      </button>
      {open && (
        <div className="document-outline__panel" role="menu">
          <div className="document-outline__label">contents</div>
          <ul className="document-outline__list">
            {headings.map((heading, index) => (
              <li key={`${heading.blockIndex}-${heading.text}`}>
                <button
                  role="menuitem"
                  data-level={heading.level}
                  className={`document-outline__entry${index === activeIndex ? " document-outline__entry--active" : ""}`}
                  onClick={() => jumpToSection(index)}
                >
                  <span className="document-outline__entry-text">
                    {heading.text}
                  </span>
                  {sectionCounts[index] > 0 && (
                    <span
                      className="document-outline__count"
                      title={`${sectionCounts[index]} open comments in this section`}
                    >
                      {sectionCounts[index]}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
