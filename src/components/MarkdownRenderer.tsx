import {
  type ComponentPropsWithoutRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Children,
  isValidElement,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import { createHighlighter, type Highlighter } from "shiki";
import { MermaidBlock } from "./MermaidBlock";
import { CommentMargin } from "./CommentMargin";
import { useAppStore } from "../store";
import { parseCriticMarkup } from "../services/criticmarkup";
import type { CommentType } from "../types/criticmarkup";
import { assignBlockIndices } from "../services/blockIndex";

// Singleton — created once, shared across all renders
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

// Rehype plugin: adds data-block-index to each top-level element node.
// This lets CommentMargin align dots with rendered blocks.
function rehypeBlockIndex() {
  return (tree: {
    children: Array<{ type: string; properties?: Record<string, unknown> }>;
  }) => {
    let idx = 0;
    for (const node of tree.children) {
      if (node.type === "element") {
        node.properties = node.properties ?? {};
        node.properties["data-block-index"] = idx++;
      }
    }
  };
}

// Override <pre> to detect mermaid blocks (which Shiki skips as unknown lang)
// and route them to MermaidBlock instead of a plain <pre>.
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
    const code = String(
      (child.props as { children?: unknown }).children ?? "",
    ).replace(/\n$/, "");
    return <MermaidBlock code={code} />;
  }
  return <pre {...props}>{children}</pre>;
}

export function MarkdownRenderer() {
  const rawContent = useAppStore((s) => s.rawContent);
  const setComments = useAppStore((s) => s.setComments);
  const addCommentAction = useAppStore((s) => s.addComment);
  const postPeerCommentAction = useAppStore((s) => s.postPeerComment);
  const isPeerMode = useAppStore((s) => s.isPeerMode);
  const fileName = useAppStore((s) => s.fileName);
  const activeFilePath = useAppStore((s) => s.activeFilePath);
  const setRealtimeAwareness = useAppStore((s) => s.setRealtimeAwareness);
  const pendingScrollTarget = useAppStore((s) => s.pendingScrollTarget);
  const clearPendingScrollTarget = useAppStore(
    (s) => s.clearPendingScrollTarget,
  );
  const setActiveCommentId = useAppStore((s) => s.setActiveCommentId);
  const writeAllowed = useAppStore((s) => s.writeAllowed);
  const rtStatus = useAppStore((s) => s.rtStatus);
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [hoveredBlock, setHoveredBlock] = useState<{
    index: number;
    top: number;
  } | null>(null);

  // Track hovered block for comment "+" button AND peer awareness.
  // The "+" button only shows when writeAllowed || isPeerMode, but we
  // always track hover when connected so peers see cursor indicators.
  const canComment = writeAllowed || isPeerMode;
  const shouldTrackHover = canComment || rtStatus === "connected";

  const handleBodyMouseOver = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!shouldTrackHover) return;
      const block = (e.target as HTMLElement).closest(
        "[data-block-index]",
      ) as HTMLElement | null;
      if (!block) return;
      setHoveredBlock({
        index: Number(block.getAttribute("data-block-index")),
        top: block.offsetTop,
      });
    },
    [shouldTrackHover],
  );

  const handleBodyMouseLeave = useCallback(() => setHoveredBlock(null), []);

  const handleAddComment = useCallback(
    (blockIndex: number, type: string, text: string) => {
      addCommentAction(
        blockIndex,
        type as CommentType,
        text,
      );
    },
    [addCommentAction],
  );

  const handlePostPeerComment = useCallback(
    (blockIndex: number, type: string, text: string) => {
      const path = activeFilePath ?? fileName ?? "";
      postPeerCommentAction(
        blockIndex,
        type as CommentType,
        text,
        path,
      );
    },
    [postPeerCommentAction, activeFilePath, fileName],
  );

  // Broadcast hovered block as focusedBlock to peers
  useEffect(() => {
    const file = activeFilePath ?? fileName ?? null;
    setRealtimeAwareness(file, hoveredBlock?.index ?? null);
  }, [hoveredBlock, activeFilePath, fileName, setRealtimeAwareness]);

  useEffect(() => {
    getHighlighter().then(setHighlighter);
  }, []);

  // Strip CriticMarkup and collect comments with block indices
  const { cleanMarkdown, comments } = useMemo(() => {
    const parsed = parseCriticMarkup(rawContent);
    const comments = assignBlockIndices(parsed.comments, parsed.cleanMarkdown);
    return { cleanMarkdown: parsed.cleanMarkdown, comments };
  }, [rawContent]);

  // Sync parsed comments into the store so CommentMargin and CommentPanel can read them
  useEffect(() => {
    setComments(comments);
  }, [comments, setComments]);

  // Handle cross-file navigation: after switching to target file, find comment and scroll
  useEffect(() => {
    if (!pendingScrollTarget) return;
    if (pendingScrollTarget.filePath !== activeFilePath) return;

    let scrollBlock: number | undefined;

    if (pendingScrollTarget.rawStart !== undefined) {
      // Host cross-file: find comment by rawStart
      const target = comments.find(
        (c) => c.rawStart === pendingScrollTarget.rawStart,
      );
      if (target) {
        setActiveCommentId(target.id);
        scrollBlock = target.blockIndex;
      }
    } else if (pendingScrollTarget.blockIndex !== undefined) {
      // Pending comment navigation: scroll directly to block
      scrollBlock = pendingScrollTarget.blockIndex;
    }

    if (scrollBlock !== undefined) {
      const bi = scrollBlock;
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-block-index="${bi}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
    clearPendingScrollTarget();
  }, [
    pendingScrollTarget,
    activeFilePath,
    comments,
    setActiveCommentId,
    clearPendingScrollTarget,
  ]);

  const rehypePlugins = highlighter
    ? ([
        rehypeBlockIndex,
        [
          rehypeShikiFromHighlighter,
          highlighter,
          { theme: "github-light", missingLang: "ignore" },
        ],
      ] as const)
    : ([rehypeBlockIndex] as const);

  return (
    <div className="markdown-scroll-area">
      {!writeAllowed && (
        <div className="readonly-banner" role="status">
          This file is read-only — comments cannot be saved.
        </div>
      )}
      <div
        className="markdown-viewer"
        ref={viewerRef}
        onMouseLeave={handleBodyMouseLeave}
      >
        <CommentMargin
          containerRef={viewerRef}
          hoveredBlock={canComment ? hoveredBlock : null}
          onAddComment={handleAddComment}
          peerMode={isPeerMode}
          onPostPeerComment={handlePostPeerComment}
        />
        <div className="markdown-body" onMouseOver={handleBodyMouseOver}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={rehypePlugins}
            components={{ pre: PreBlock }}
          >
            {cleanMarkdown}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
