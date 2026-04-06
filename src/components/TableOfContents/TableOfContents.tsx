import "./TableOfContents.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../store";
import { useActiveTab } from "../../store/selectors";
import { parseCriticMarkup } from "../../markup";
import { extractHeadings } from "../../utils/extractHeadings";

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

export function TableOfContents({ peerMode = false }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const tab = useActiveTab();
  const peerRawContent = useAppStore((s) => s.peerRawContent);

  const rawContent = peerMode ? peerRawContent : (tab?.rawContent ?? "");

  const headings = useMemo(() => {
    if (!rawContent) {
      return [];
    }
    const { cleanMarkdown } = parseCriticMarkup(rawContent);
    return extractHeadings(cleanMarkdown);
  }, [rawContent]);

  const disabled = headings.length === 0;

  // Close on click outside
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  function handleHeadingClick(blockIndex: number) {
    scrollToBlock(blockIndex);
    setIsOpen(false);
  }

  return (
    <div className="toc" ref={dropdownRef}>
      <button
        className="app-header__btn app-header__btn--icon"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        aria-label="Table of contents"
        title="Table of contents"
      >
        <OutlineIcon />
      </button>

      {isOpen && (
        <div className="toc__menu">
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
