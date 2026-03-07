import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./MarkdownRenderer";
import { SunIcon, MoonIcon } from "./Icons";
import { useAppStore } from "../store";
import { useActiveTab } from "../store/selectors";
import { parseCriticMarkup } from "../services/criticmarkup";
import { useShikiRehypePlugin } from "../services/highlighter";

function splitIntoSlides(markdown: string): string[] {
  const lines = markdown.split("\n");
  const slides: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^# /.test(line) || /^---\s*$/.test(line)) {
      if (current.length > 0) {
        slides.push(current.join("\n").trim());
      }
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
  const shikiPlugin = useShikiRehypePlugin();

  const [currentSlide, setCurrentSlide] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const viewportRef = useRef<HTMLDivElement>(null);

  // Use refs for values needed in stable callbacks
  const slideRef = useRef(currentSlide);
  slideRef.current = currentSlide;
  const animatingRef = useRef(animating);
  animatingRef.current = animating;

  const cleanMarkdown = useMemo(() => {
    return parseCriticMarkup(rawContent).cleanMarkdown;
  }, [rawContent]);

  const slides = useMemo(() => splitIntoSlides(cleanMarkdown), [cleanMarkdown]);
  const slidesRef = useRef(slides);
  slidesRef.current = slides;

  // Request fullscreen on mount, exit presentation when fullscreen ends
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});

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

  // Stable navigation — reads from refs, no dependency churn
  const goTo = useCallback(
    (index: number, dir: "up" | "down" | null) => {
      const total = slidesRef.current.length;
      const cur = slideRef.current;
      if (index < 0 || index >= total || index === cur) return;
      if (animatingRef.current) return;

      const el = viewportRef.current;
      if (!el) return;

      setAnimating(true);
      const cls =
        dir === "up"
          ? "presentation-slide--enter-up"
          : dir === "down"
            ? "presentation-slide--enter-down"
            : "presentation-slide--fade";

      el.classList.remove(
        "presentation-slide--enter-up",
        "presentation-slide--enter-down",
        "presentation-slide--fade",
      );
      // Force reflow so re-adding the same class restarts the animation
      void el.offsetHeight;

      setCurrentSlide(index);
      el.classList.add(cls);
    },
    [],
  );

  // Clear animating flag when CSS animation finishes
  const handleAnimationEnd = useCallback(() => {
    setAnimating(false);
  }, []);

  const goNext = useCallback(() => {
    goTo(slideRef.current + 1, "up");
  }, [goTo]);

  const goPrev = useCallback(() => {
    goTo(slideRef.current - 1, "down");
  }, [goTo]);

  // Keyboard navigation — stable deps, registered once
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
          goTo(slidesRef.current.length - 1, "up");
          break;
        case "Escape":
          e.preventDefault();
          // Let fullscreenchange listener handle exit to avoid double-call
          if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
          } else {
            exitPresentationMode();
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, goTo, exitPresentationMode]);

  const isDark = theme === "dark";

  const rehypePlugins = shikiPlugin ? ([shikiPlugin] as const) : ([] as const);

  return (
    <div className="presentation" onMouseMove={resetControlsTimer}>
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

      <div
        className="presentation__viewport"
        ref={viewportRef}
        onAnimationEnd={handleAnimationEnd}
      >
        <div className="presentation__slide markdown-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={rehypePlugins}
            components={{ code: CodeBlock }}
          >
            {slides[currentSlide]}
          </ReactMarkdown>
        </div>
      </div>

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

      <button
        className={`presentation__theme ${controlsVisible ? "presentation__control--visible" : ""}`}
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {isDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
      </button>
    </div>
  );
}
