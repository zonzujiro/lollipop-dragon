import "./DocumentOutline.css";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { extractHeadings, type Heading } from "../../../utils/extractHeadings";
import type { Comment } from "../../../types/criticmarkup";

interface Props {
  cleanMarkdown: string;
  comments: Comment[];
  scrollRootRef: RefObject<HTMLDivElement | null>;
}

const ACTIVE_SCROLL_OFFSET = 100;
// Linear's rule: when the map would overflow, keep only top-level headings
const TICK_CAP = 20;

interface OutlineEntry extends Heading {
  count: number;
}

// Edge-persistent outline minimap (Notion / Linear / Paper convention):
// heading tick marks always visible at the reading column's right edge,
// expanding on hover into the contents panel with per-section comment counts.
export function DocumentOutline({
  cleanMarkdown,
  comments,
  scrollRootRef,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allHeadings = useMemo(
    () => extractHeadings(cleanMarkdown),
    [cleanMarkdown],
  );

  const entries = useMemo<OutlineEntry[]>(() => {
    const headings =
      allHeadings.length > TICK_CAP
        ? allHeadings.filter((heading) => heading.level <= 2)
        : allHeadings;
    return headings.map((heading, index) => {
      const sectionStart = heading.blockIndex;
      const sectionEnd = headings[index + 1]?.blockIndex ?? Infinity;
      const count = comments.filter(
        (comment) =>
          comment.blockIndex !== undefined &&
          comment.blockIndex >= sectionStart &&
          comment.blockIndex < sectionEnd,
      ).length;
      return { ...heading, count };
    });
  }, [allHeadings, comments]);

  // Track the section under the reading position
  useEffect(() => {
    const scrollRoot = scrollRootRef.current;
    if (!scrollRoot || entries.length === 0) {
      return;
    }
    let frame = 0;
    const updateActiveSection = () => {
      frame = 0;
      const threshold = scrollRoot.scrollTop + ACTIVE_SCROLL_OFFSET;
      let nextActive = 0;
      for (let index = 0; index < entries.length; index += 1) {
        const block = scrollRoot.querySelector<HTMLElement>(
          `[data-block-index="${entries[index].blockIndex}"]`,
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
  }, [entries, scrollRootRef]);

  useEffect(() => {
    if (!expanded) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [expanded]);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setExpanded(false), 180);
  }, [cancelClose]);

  const jumpToSection = useCallback(
    (index: number) => {
      const entry = entries[index];
      if (!entry) {
        return;
      }
      const root = scrollRootRef.current ?? document;
      root
        .querySelector(`[data-block-index="${entry.blockIndex}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveIndex(index);
      setExpanded(false);
    },
    [entries, scrollRootRef],
  );

  if (entries.length === 0) {
    return null;
  }

  return (
    <div
      className="document-outline"
      ref={rootRef}
      onMouseEnter={() => {
        cancelClose();
        setExpanded(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        className="document-outline__map"
        aria-label="Table of contents"
        aria-expanded={expanded}
        aria-haspopup="menu"
        onClick={() => setExpanded(!expanded)}
        onFocus={() => setExpanded(true)}
      >
        {entries.map((entry, index) => (
          <span
            key={`${entry.blockIndex}-${entry.text}`}
            className={`document-outline__tick${index === activeIndex ? " document-outline__tick--active" : ""}${entry.count > 0 ? " document-outline__tick--commented" : ""}`}
            data-level={Math.min(entry.level, 4)}
            aria-hidden="true"
          />
        ))}
      </button>
      {expanded && (
        <div
          className="document-outline__panel"
          role="menu"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className="document-outline__label">contents</div>
          <ul className="document-outline__list">
            {entries.map((entry, index) => (
              <li key={`${entry.blockIndex}-${entry.text}`}>
                <button
                  role="menuitem"
                  data-level={entry.level}
                  className={`document-outline__entry${index === activeIndex ? " document-outline__entry--active" : ""}`}
                  onClick={() => jumpToSection(index)}
                >
                  <span className="document-outline__entry-text">
                    {entry.text}
                  </span>
                  {entry.count > 0 && (
                    <span
                      className="document-outline__count"
                      title={`${entry.count} open comments in this section`}
                    >
                      {entry.count}
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
