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
import { useActiveTab } from "../store/selectors";
import { parseCriticMarkup, isCommentType } from "../services/criticmarkup";
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

export function MarkdownRenderer() {
  const tab = useActiveTab();
  const isPeerMode = useAppStore((s) => s.isPeerMode);

  // In peer mode, read from global peer state; in host mode, from active tab
  const rawContent = useAppStore((s) =>
    s.isPeerMode ? s.peerRawContent : (tab?.rawContent ?? ""),
  );
  const fileName = isPeerMode
    ? useAppStore.getState().peerFileName
    : (tab?.fileName ?? null);
  const activeFilePath = isPeerMode
    ? useAppStore.getState().peerActiveFilePath
    : (tab?.activeFilePath ?? null);
  const pendingScrollTarget = tab?.pendingScrollTarget ?? null;
  const writeAllowed = tab?.writeAllowed ?? false;

  const setComments = useAppStore((s) => s.setComments);
  const addCommentAction = useAppStore((s) => s.addComment);
  const postPeerCommentAction = useAppStore((s) => s.postPeerComment);
  const clearPendingScrollTarget = useAppStore(
    (s) => s.clearPendingScrollTarget,
  );
  const setActiveCommentId = useAppStore((s) => s.setActiveCommentId);
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [hoveredBlock, setHoveredBlock] = useState<{
    index: number;
    top: number;
  } | null>(null);

  const canComment = writeAllowed || isPeerMode;
  const shouldTrackHover = canComment;

  const handleBodyMouseOver = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!shouldTrackHover) return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const block = target.closest("[data-block-index]");
      if (!(block instanceof HTMLElement)) return;
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
      if (!isCommentType(type)) return;
      addCommentAction(blockIndex, type, text);
    },
    [addCommentAction],
  );

  const handlePostPeerComment = useCallback(
    (blockIndex: number, type: string, text: string) => {
      if (!isCommentType(type)) return;
      const path = activeFilePath ?? fileName ?? "";
      postPeerCommentAction(blockIndex, type, text, path);
    },
    [postPeerCommentAction, activeFilePath, fileName],
  );

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
      {!writeAllowed && !isPeerMode && (
        <div className="readonly-banner" role="status">
          Read-only — write permission was denied or the file is on a read-only
          filesystem. Comments cannot be saved to disk.
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
