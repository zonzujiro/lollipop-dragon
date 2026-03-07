import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import { createHighlighter, type Highlighter } from "shiki";
import { MermaidBlock } from "./MermaidBlock";
import { useAppStore } from "../store";
import { useActiveTab } from "../store/selectors";
import { parseCriticMarkup } from "../services/criticmarkup";
import {
  type ComponentPropsWithoutRef,
  Children,
  isValidElement,
} from "react";

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light"],
      langs: [
        "javascript",
        "typescript",
        "tsx",
        "jsx",
        "python",
        "bash",
        "sh",
        "json",
        "yaml",
        "css",
        "html",
        "markdown",
        "sql",
        "rust",
        "go",
        "java",
        "c",
        "cpp",
      ],
    });
  }
  return highlighterPromise;
}

function PreBlock({ children, ...props }: ComponentPropsWithoutRef<"pre">) {
  const child = Children.toArray(children)[0];
  if (
    isValidElement(child) &&
    typeof child.props === "object" &&
    child.props !== null &&
    "className" in child.props &&
    typeof child.props.className === "string" &&
    child.props.className.includes("language-mermaid")
  ) {
    const childProps = child.props;
    const code = String(
      typeof childProps === "object" &&
        childProps !== null &&
        "children" in childProps
        ? childProps.children
        : "",
    ).replace(/\n$/, "");
    return <MermaidBlock code={code} />;
  }
  return <pre {...props}>{children}</pre>;
}

function SunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function splitIntoSlides(markdown: string): string[] {
  const lines = markdown.split("\n");
  const slides: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    // Split on top-level headings or horizontal rules
    if (/^# /.test(line) || /^---\s*$/.test(line)) {
      if (current.length > 0) {
        slides.push(current.join("\n").trim());
      }
      // For headings, start the new slide with the heading line
      // For hr, start a fresh slide (skip the --- itself)
      current = /^# /.test(line) ? [line] : [];
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    const text = current.join("\n").trim();
    if (text) slides.push(text);
  }

  return slides.length > 0 ? slides : [""];
}

export function PresentationMode() {
  const tab = useActiveTab();
  const rawContent = tab?.rawContent ?? "";
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const exitPresentationMode = useAppStore((s) => s.exitPresentationMode);

  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  const [animating, setAnimating] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null);

  const cleanMarkdown = useMemo(() => {
    return parseCriticMarkup(rawContent).cleanMarkdown;
  }, [rawContent]);

  const slides = useMemo(() => splitIntoSlides(cleanMarkdown), [cleanMarkdown]);

  useEffect(() => {
    getHighlighter().then(setHighlighter);
  }, []);

  // Request fullscreen on mount
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {
      // Browser denied — that's fine, we still work windowed
    });

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        exitPresentationMode();
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    };
  }, [exitPresentationMode]);

  // Auto-hide controls after inactivity
  const resetControlsTimer = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 2000);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => clearTimeout(hideTimerRef.current);
  }, [resetControlsTimer]);

  const handleMouseMove = useCallback(() => {
    resetControlsTimer();
  }, [resetControlsTimer]);

  const goTo = useCallback(
    (index: number, dir: "up" | "down" | null) => {
      if (index < 0 || index >= slides.length || index === currentSlide) return;
      if (animating) return;
      setDirection(dir);
      setAnimating(true);
      // Small delay so CSS can pick up the direction class before the slide changes
      requestAnimationFrame(() => {
        setCurrentSlide(index);
        setTimeout(() => setAnimating(false), 300);
      });
    },
    [slides.length, currentSlide, animating],
  );

  const goNext = useCallback(() => {
    goTo(currentSlide + 1, "up");
  }, [goTo, currentSlide]);

  const goPrev = useCallback(() => {
    goTo(currentSlide - 1, "down");
  }, [goTo, currentSlide]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
        case "ArrowRight":
        case " ":
        case "PageDown":
          e.preventDefault();
          goNext();
          break;
        case "ArrowUp":
        case "ArrowLeft":
        case "Backspace":
        case "PageUp":
          e.preventDefault();
          goPrev();
          break;
        case "Home":
          e.preventDefault();
          goTo(0, "down");
          break;
        case "End":
          e.preventDefault();
          goTo(slides.length - 1, "up");
          break;
        case "Escape":
          e.preventDefault();
          exitPresentationMode();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, goTo, slides.length, exitPresentationMode]);

  const isDark = theme === "dark";

  const rehypePlugins = highlighter
    ? ([
        [
          rehypeShikiFromHighlighter,
          highlighter,
          { theme: "github-light", missingLang: "ignore" },
        ],
      ] as const)
    : ([] as const);

  const directionClass = direction === "up"
    ? "presentation-slide--enter-up"
    : direction === "down"
      ? "presentation-slide--enter-down"
      : "";

  return (
    <div
      className="presentation"
      ref={containerRef}
      onMouseMove={handleMouseMove}
    >
      {/* Exit button */}
      <button
        className={`presentation__exit ${controlsVisible ? "presentation__control--visible" : ""}`}
        onClick={exitPresentationMode}
        aria-label="Exit presentation mode"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>

      {/* Slide content */}
      <div className={`presentation__viewport ${directionClass}`} key={currentSlide}>
        <div className="presentation__slide markdown-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={rehypePlugins}
            components={{ pre: PreBlock }}
          >
            {slides[currentSlide]}
          </ReactMarkdown>
        </div>
      </div>

      {/* Dot navigation */}
      {slides.length > 1 && (
        <nav className="presentation__dots" aria-label="Slide navigation">
          {slides.map((_, i) => (
            <button
              key={i}
              className={`presentation__dot ${i === currentSlide ? "presentation__dot--active" : ""}`}
              onClick={() => goTo(i, i > currentSlide ? "up" : "down")}
              aria-label={`Go to slide ${i + 1}`}
              aria-current={i === currentSlide ? "step" : undefined}
            />
          ))}
        </nav>
      )}

      {/* Theme toggle */}
      <button
        className={`presentation__theme ${controlsVisible ? "presentation__control--visible" : ""}`}
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </button>
    </div>
  );
}
