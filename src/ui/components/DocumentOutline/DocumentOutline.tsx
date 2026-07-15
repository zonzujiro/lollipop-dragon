import "./DocumentOutline.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { extractHeadings } from "../../../utils/extractHeadings";
import type { Comment } from "../../../types/criticmarkup";

interface Props {
  path: string;
  cleanMarkdown: string;
  comments: Comment[];
  scrollRootRef?: RefObject<HTMLDivElement | null>;
}

const ACTIVE_SCROLL_OFFSET = 100;

function ChevronDownIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// The document's orientation bar: sticky path + the current section, which
// opens an outline panel where every section carries its open-comment count.
export function DocumentOutline({
  path,
  cleanMarkdown,
  comments,
  scrollRootRef,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const headings = useMemo(
    () => extractHeadings(cleanMarkdown),
    [cleanMarkdown],
  );

  const sectionCounts = useMemo(() => {
    return headings.map((heading, index) => {
      const sectionStart = heading.blockIndex;
      const sectionEnd = headings[index + 1]?.blockIndex ?? Infinity;
      return comments.filter(
        (comment) =>
          comment.blockIndex !== undefined &&
          comment.blockIndex >= sectionStart &&
          comment.blockIndex < sectionEnd,
      ).length;
    });
  }, [comments, headings]);

  // Track the section under the reading position while the document scrolls
  useEffect(() => {
    const scrollRoot = scrollRootRef?.current;
    if (!scrollRoot || headings.length === 0) {
      return;
    }
    let frame = 0;
    const updateActiveSection = () => {
      frame = 0;
      const threshold = scrollRoot.scrollTop + ACTIVE_SCROLL_OFFSET;
      let nextActive = 0;
      for (let index = 0; index < headings.length; index += 1) {
        const block = scrollRoot.querySelector<HTMLElement>(
          `[data-block-index="${headings[index].blockIndex}"]`,
        );
        if (block && block.offsetTop <= threshold) {
          nextActive = index;
        }
      }
      setActiveIndex(nextActive);
    };
    const handleScroll = () => {
      if (!frame) {
        frame = requestAnimationFrame(updateActiveSection);
      }
    };
    updateActiveSection();
    scrollRoot.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollRoot.removeEventListener("scroll", handleScroll);
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, [headings, scrollRootRef]);

  // Close on click outside / Escape
  useEffect(() => {
    if (!open) {
      return;
    }
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
  }, [open]);

  const jumpToSection = useCallback(
    (index: number) => {
      const heading = headings[index];
      if (!heading) {
        return;
      }
      const root = scrollRootRef?.current ?? document;
      root
        .querySelector(`[data-block-index="${heading.blockIndex}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveIndex(index);
      setOpen(false);
    },
    [headings, scrollRootRef],
  );

  const activeHeading = headings[activeIndex] ?? headings[0];

  return (
    <div className="document-outline" ref={rootRef}>
      <div className="document-outline__bar">
        <span className="document-outline__path" title={path}>
          {path}
        </span>
        {headings.length > 0 && (
          <>
            <span className="document-outline__sep" aria-hidden="true">
              ·
            </span>
            <button
              className="document-outline__section"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-haspopup="menu"
              aria-label="Table of contents"
              title="Table of contents"
            >
              <span className="document-outline__mark" aria-hidden="true">
                §
              </span>
              <span className="document-outline__section-text">
                {activeHeading?.text}
              </span>
              <ChevronDownIcon />
            </button>
          </>
        )}
      </div>
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
