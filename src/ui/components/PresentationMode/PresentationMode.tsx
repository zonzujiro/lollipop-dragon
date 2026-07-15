import "./PresentationMode.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock, PreBlock } from "../MarkdownRenderer";
import { SunIcon, MoonIcon } from "../Icons";
import { useAppStore } from "../../../store";
import { useActiveTab } from "../../../store/selectors";
import {
  parseCriticMarkup,
  parseMarkdownFrontmatter,
  useShikiRehypePlugin,
} from "../../../markup";

function splitIntoSlides(markdown: string): string[] {
  const lines = markdown.split("\n");
  const slides: string[] = [];
  let current: string[] = [];
  let inFence = false;

  for (const line of lines) {
    // Track fenced code blocks so we don't split on headings/HRs inside them
    if (/^(`{3,}|~{3,})/.test(line)) {
      inFence = !inFence;
    }

    if (!inFence && /^---\s*$/.test(line)) {
      if (current.length > 0) {
        slides.push(current.join("\n").trim());
      }
      current = [];
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    const text = current.join("\n").trim();
    if (text) {
      slides.push(text);
    }
  }

  return slides.length > 0 ? slides : [""];
}

type SlideDirection = "up" | "down" | "fade";

const ANIMATION_CLASSES: Record<SlideDirection, string> = {
  up: "presentation-slide--enter-up",
  down: "presentation-slide--enter-down",
  fade: "presentation-slide--fade",
};

function applySlideAnimation(el: HTMLElement, dir: SlideDirection) {
  const allClasses = Object.values(ANIMATION_CLASSES);
  el.classList.remove(...allClasses);
  void el.offsetHeight; // reflow to restart animation
  el.classList.add(ANIMATION_CLASSES[dir]);
}

export function PresentationMode() {
  const tab = useActiveTab();
  const rawContent = tab?.rawContent ?? "";
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const exitPresentationMode = useAppStore((s) => s.exitPresentationMode);
  const shikiPlugin = useShikiRehypePlugin();

  const [currentSlide, setCurrentSlide] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const viewportRef = useRef<HTMLDivElement>(null);

  const cleanMarkdown = useMemo(() => {
    const document = parseMarkdownFrontmatter(rawContent);
    return parseCriticMarkup(document.body).cleanMarkdown;
  }, [rawContent]);

  const slides = useMemo(() => splitIntoSlides(cleanMarkdown), [cleanMarkdown]);

  // Clamp currentSlide if content changes and shrinks the slide count
  useEffect(() => {
    if (currentSlide >= slides.length) {
      setCurrentSlide(Math.max(0, slides.length - 1));
    }
  }, [slides.length, currentSlide]);

  // Exit presentation when fullscreen ends; clean up fullscreen on unmount
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        exitPresentationMode();
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (document.fullscreenElement === document.documentElement) {
        void document.exitFullscreen?.().catch((error: unknown) => {
          console.warn("[presentation] failed to exit fullscreen:", error);
        });
      }
    };
  }, [exitPresentationMode]);

  // Auto-hide controls after inactivity (throttled for mousemove)
  const lastMoveRef = useRef(0);
  const resetControlsTimer = useCallback(() => {
    const now = Date.now();
    if (now - lastMoveRef.current < 200) {
      return;
    }
    lastMoveRef.current = now;
    setControlsVisible(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 2000);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => clearTimeout(hideTimerRef.current);
  }, [resetControlsTimer]);

  const goTo = useCallback(
    (index: number, dir: SlideDirection) => {
      if (index < 0 || index >= slides.length || index === currentSlide) {
        return;
      }
      setCurrentSlide(index);
      if (viewportRef.current) {
        viewportRef.current.scrollTop = 0;
        applySlideAnimation(viewportRef.current, dir);
      }
    },
    [slides.length, currentSlide],
  );

  // Keyboard navigation
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const canGoForward = currentSlide < slides.length - 1;
      const canGoBackward = currentSlide > 0;

      if (["ArrowDown", "ArrowRight", " ", "PageDown"].includes(event.key)) {
        if (canGoForward) {
          event.preventDefault();
          goTo(currentSlide + 1, "up");
        }
        return;
      }
      if (["ArrowUp", "ArrowLeft", "Backspace", "PageUp"].includes(event.key)) {
        if (canGoBackward) {
          event.preventDefault();
          goTo(currentSlide - 1, "down");
        }
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        goTo(0, "down");
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        goTo(slides.length - 1, "up");
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (document.fullscreenElement && document.exitFullscreen) {
          void document.exitFullscreen().catch((error: unknown) => {
            console.warn("[presentation] failed to exit fullscreen:", error);
          });
        } else {
          exitPresentationMode();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, currentSlide, slides.length, exitPresentationMode]);

  const isDark = theme === "dark";
  const rehypePlugins: ComponentProps<typeof ReactMarkdown>["rehypePlugins"] =
    shikiPlugin ? [shikiPlugin] : [];

  return (
    <div className="presentation" onMouseMove={resetControlsTimer}>
      <button
        className={`presentation__exit ${controlsVisible ? "presentation__control--visible" : ""}`}
        onClick={exitPresentationMode}
        aria-label="Exit presentation mode"
        tabIndex={controlsVisible ? 0 : -1}
        aria-hidden={!controlsVisible}
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

      <div className="presentation__viewport" ref={viewportRef}>
        <div className="presentation__kicker">
          {tab?.fileName ?? "Document"} · slide {currentSlide + 1}
        </div>
        <div className="presentation__slide markdown-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={rehypePlugins}
            components={{ code: CodeBlock, pre: PreBlock }}
          >
            {slides[currentSlide]}
          </ReactMarkdown>
        </div>
      </div>

      <div className="presentation__counter">
        {currentSlide + 1} / {slides.length}
      </div>
      <div className="presentation__keys">← → navigate · Esc exit</div>

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
        tabIndex={controlsVisible ? 0 : -1}
        aria-hidden={!controlsVisible}
      >
        {isDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
      </button>
    </div>
  );
}
