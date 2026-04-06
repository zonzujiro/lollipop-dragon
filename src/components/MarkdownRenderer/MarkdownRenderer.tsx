import "./MarkdownRenderer.css";
import {
  type ComponentPropsWithoutRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidBlock } from "../MermaidBlock";
import { CommentMargin } from "../CommentMargin";
import { useAppStore } from "../../store";
import { useActiveTab } from "../../store/selectors";
import {
  assignBlockIndices,
  isCommentType,
  parseCriticMarkup,
  useShikiRehypePlugin,
} from "../../markup";

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

export function CodeBlock({
  className,
  children,
}: ComponentPropsWithoutRef<"code">) {
  if (className?.includes("language-mermaid")) {
    return <MermaidBlock code={String(children).replace(/\n$/, "")} />;
  }
  return <code className={className}>{children}</code>;
}

// Unwrap <pre> for mermaid blocks to avoid invalid <pre><div> nesting.
// react-markdown passes a CodeBlock element as the child of pre; we check
// its className prop to detect mermaid before it renders.
export function PreBlock({ children }: ComponentPropsWithoutRef<"pre">) {
  const child = Array.isArray(children) ? children[0] : children;
  if (
    child &&
    typeof child === "object" &&
    "props" in child &&
    child.props?.className?.includes("language-mermaid")
  ) {
    return <>{children}</>;
  }
  return <pre>{children}</pre>;
}

const markdownComponents = { code: CodeBlock, pre: PreBlock };

export function MarkdownRenderer() {
  const tab = useActiveTab();
  const isPeerMode = useAppStore((s) => s.isPeerMode);

  // In peer mode, read from global peer state; in host mode, from active tab
  const rawContent = useAppStore((s) =>
    s.isPeerMode ? s.peerRawContent : (tab?.rawContent ?? ""),
  );
  const peerFileName = useAppStore((s) => s.peerFileName);
  const peerActiveFilePath = useAppStore((s) => s.peerActiveFilePath);
  const fileName = isPeerMode ? peerFileName : (tab?.fileName ?? null);
  const activeFilePath = isPeerMode
    ? peerActiveFilePath
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
  const shikiPlugin = useShikiRehypePlugin();
  const viewerRef = useRef<HTMLDivElement>(null);
  const [hoveredBlock, setHoveredBlock] = useState<{
    index: number;
    top: number;
  } | null>(null);

  const canComment = writeAllowed || isPeerMode;
  const shouldTrackHover = canComment;

  const handleBodyMouseOver = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!shouldTrackHover) {
        return;
      }
      const target = e.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const block = target.closest("[data-block-index]");
      if (!(block instanceof HTMLElement)) {
        return;
      }
      const index = Number(block.getAttribute("data-block-index"));
      const top = block.offsetTop;
      setHoveredBlock((prev) => {
        if (prev && prev.index === index && prev.top === top) {
          return prev;
        }
        return { index, top };
      });
    },
    [shouldTrackHover],
  );

  const handleBodyMouseLeave = useCallback(() => setHoveredBlock(null), []);

  const handleAddComment = useCallback(
    (blockIndex: number, type: string, text: string) => {
      if (!isCommentType(type)) {
        return;
      }
      addCommentAction(blockIndex, type, text);
    },
    [addCommentAction],
  );

  const handlePostPeerComment = useCallback(
    (blockIndex: number, type: string, text: string) => {
      if (!isCommentType(type)) {
        return;
      }
      const path = activeFilePath ?? fileName ?? "";
      postPeerCommentAction(blockIndex, type, text, path);
    },
    [postPeerCommentAction, activeFilePath, fileName],
  );

  // Strip CriticMarkup and collect comments with block indices
  const { cleanMarkdown, comments } = useMemo(() => {
    const parsed = parseCriticMarkup(rawContent);
    const comments = assignBlockIndices(parsed.comments, parsed.cleanMarkdown);
    return { cleanMarkdown: parsed.cleanMarkdown, comments };
  }, [rawContent]);

  // Sync parsed comments into the store during render to avoid an extra
  // render cycle from a useEffect chain.
  const prevCommentsRef = useRef(comments);
  if (prevCommentsRef.current !== comments) {
    prevCommentsRef.current = comments;
    setComments(comments);
  }

  // Handle cross-file navigation: after switching to target file, find comment and scroll
  useEffect(() => {
    if (!pendingScrollTarget) {
      return;
    }
    if (pendingScrollTarget.filePath !== activeFilePath) {
      return;
    }

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
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  // Highlight the block when hovering a comment in the panel
  const hoveredBlockHighlight = useAppStore((s) => s.hoveredBlockHighlight);
  useEffect(() => {
    if (!hoveredBlockHighlight) {
      return;
    }
    const el = viewerRef.current?.querySelector(
      `[data-block-index="${hoveredBlockHighlight.blockIndex}"]`,
    );
    if (!(el instanceof HTMLElement)) {
      return;
    }
    el.setAttribute("data-highlight-type", hoveredBlockHighlight.commentType);
    return () => {
      el.removeAttribute("data-highlight-type");
    };
  }, [hoveredBlockHighlight]);

  const rehypePlugins = shikiPlugin
    ? ([rehypeBlockIndex, shikiPlugin] as const)
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
            components={markdownComponents}
          >
            {cleanMarkdown}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
