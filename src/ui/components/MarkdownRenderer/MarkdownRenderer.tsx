import "./MarkdownRenderer.css";
import {
  Children,
  createContext,
  isValidElement,
  type ReactNode,
  type ComponentPropsWithoutRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useContext,
} from "react";
import type { PluggableList } from "unified";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidBlock } from "../MermaidBlock";
import type { MermaidComment } from "../MermaidBlock/MermaidBlock";
import { CodeCommentSurface } from "../CodeCommentSurface";
import { CommentMargin } from "../CommentMargin";
import { useAppStore } from "../../../store";
import { useActiveTabField } from "../../../store/selectors";
import {
  assignBlockIndices,
  applyCommentHighlights,
  findQuoteOccurrences,
  getBlockPlainTextMap,
  getBlockPositions,
  isCommentType,
  parseMarkdownFrontmatter,
  parseCriticMarkup,
  shiftCommentRawOffsets,
  removeCommentHighlights,
  resolveCommentAnchor,
  useShikiRehypePlugin,
} from "../../../markup";
import { getActiveAgentRunForTab } from "../../../modules/agent-workflow";
import type { MarkdownMetadataField } from "../../../markup";
import type { Comment, CommentAnchorDraft } from "../../../types/criticmarkup";
import { COMMENT_TYPE_COLOR } from "../../../types/criticmarkup";
import type { PeerComment } from "../../../types/share";
import {
  getRestoreOpenOtherLabel,
  getRestoreWorkspaceName,
  shouldRenderRestoreBanner,
} from "../../../types/tab";
import type { TabState } from "../../../types/tab";

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

interface SpecialBlockContextValue {
  activeCommentId: string | null;
  comments: Comment[];
  onCreateAnchor: (blockIndex: number, anchor: CommentAnchorDraft) => void;
  onSelectComment: (commentId: string) => void;
  onViewChange: (blockIndex: number, view: "diagram" | "source") => void;
  specialViews: Map<number, "diagram" | "source">;
}

const SpecialBlockContext = createContext<SpecialBlockContextValue | null>(
  null,
);

// djb2 — cheap, stable content fingerprint for the remount key
function hashContentKey(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function textFromReactNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textFromReactNode).join("");
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textFromReactNode(node.props.children);
  }
  return "";
}

export function CodeBlock({
  className,
  children,
}: ComponentPropsWithoutRef<"code">) {
  return <code className={className}>{children}</code>;
}

interface PreBlockProps extends ComponentPropsWithoutRef<"pre"> {
  "data-block-index"?: number | string;
}

export function PreBlock({ children, ...props }: PreBlockProps) {
  const specialBlock = useContext(SpecialBlockContext);
  const child = Children.toArray(children)[0];
  if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) {
    return <pre>{children}</pre>;
  }
  const rawBlockIndex = props["data-block-index"];
  const blockIndex = Number(rawBlockIndex);
  if (!specialBlock || !Number.isInteger(blockIndex)) {
    return <pre data-block-index={rawBlockIndex}>{children}</pre>;
  }
  const className = child.props.className;
  const plainText = textFromReactNode(child.props.children).replace(/\n$/, "");
  const blockComments = specialBlock.comments.filter(
    (comment) => comment.blockIndex === blockIndex && !!comment.anchor,
  );
  const onCreateAnchor = (anchor: CommentAnchorDraft) => {
    specialBlock.onCreateAnchor(blockIndex, anchor);
  };
  if (className?.includes("language-mermaid")) {
    const mermaidComments: MermaidComment[] = blockComments.map((comment) => ({
      id: comment.id,
      type: comment.type,
      anchor: comment.anchor,
      authorLabel: comment.thread?.authorLabel ?? "You",
    }));
    return (
      <MermaidBlock
        activeCommentId={specialBlock.activeCommentId}
        blockIndex={blockIndex}
        code={plainText}
        comments={mermaidComments}
        initialView={specialBlock.specialViews.get(blockIndex)}
        onCreateAnchor={onCreateAnchor}
        onSelectComment={specialBlock.onSelectComment}
        onViewChange={(view) => specialBlock.onViewChange(blockIndex, view)}
      />
    );
  }
  return (
    <div className="code-comment-block" data-block-index={blockIndex}>
      <CodeCommentSurface
        plainText={plainText}
        languageClassName={className}
        onCreateAnchor={onCreateAnchor}
      >
        {child.props.children}
      </CodeCommentSurface>
    </div>
  );
}

const markdownComponents = { code: CodeBlock, pre: PreBlock };

interface RangeCommentDraft {
  blockIndex: number;
  top: number;
  anchor: CommentAnchorDraft;
}

function offsetWithinBlock(root: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function captureRangeCommentDraft(
  selection: Selection,
): RangeCommentDraft | null {
  if (selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const startElement =
    range.startContainer instanceof HTMLElement
      ? range.startContainer
      : range.startContainer.parentElement;
  const block = startElement?.closest<HTMLElement>("[data-block-index]");
  if (!block) {
    return null;
  }
  const anchorRoot =
    block.querySelector<HTMLElement>("[data-anchor-root]") ?? block;
  if (!anchorRoot.contains(range.startContainer)) {
    return null;
  }
  let start = offsetWithinBlock(
    anchorRoot,
    range.startContainer,
    range.startOffset,
  );
  let end = anchorRoot.contains(range.endContainer)
    ? offsetWithinBlock(anchorRoot, range.endContainer, range.endOffset)
    : (anchorRoot.textContent?.length ?? 0);
  const plainText = anchorRoot.textContent ?? "";
  while (start < end && /\s/.test(plainText[start])) {
    start += 1;
  }
  while (end > start && /\s/.test(plainText[end - 1])) {
    end -= 1;
  }
  const quote = plainText.slice(start, end);
  if (quote.length < 3 || quote.length > 300) {
    return null;
  }
  const occurrences = findQuoteOccurrences(plainText, quote);
  const occurrence = Math.max(occurrences.indexOf(start) + 1, 1);
  const blockIndex = Number(block.dataset.blockIndex);
  if (!Number.isInteger(blockIndex)) {
    return null;
  }
  return {
    blockIndex,
    top: block.offsetTop,
    anchor: { quote, occurrence, start, end },
  };
}

function getCleanMarkdownBlocks(rawContent: string): string[] {
  const document = parseMarkdownFrontmatter(rawContent);
  const cleanMarkdown = parseCriticMarkup(document.body).cleanMarkdown;
  return getBlockPositions(cleanMarkdown).map((block) =>
    cleanMarkdown.slice(block.start, block.end),
  );
}

function buildPeerRangeComments(input: {
  comments: PeerComment[];
  activeFilePath: string | null;
  cleanMarkdown: string;
}): Comment[] {
  return input.comments.flatMap((peerComment, commentIndex) => {
    if (
      peerComment.path !== input.activeFilePath ||
      !peerComment.blockRef.quote
    ) {
      return [];
    }
    const blockMap = getBlockPlainTextMap(
      input.cleanMarkdown,
      peerComment.blockRef.blockIndex,
    );
    if (!blockMap) {
      return [];
    }
    const anchor = resolveCommentAnchor(blockMap.plainText, {
      quote: peerComment.blockRef.quote,
      occurrence: peerComment.blockRef.occurrence ?? 1,
    });
    return [
      {
        id: peerComment.id,
        criticType: "comment",
        type: peerComment.commentType,
        text: peerComment.text,
        raw: "",
        rawStart: commentIndex,
        rawEnd: commentIndex,
        cleanStart: 0,
        cleanEnd: 0,
        blockIndex: peerComment.blockRef.blockIndex,
        thread: {
          commentId: peerComment.id,
          threadId: peerComment.id,
          authorLabel: peerComment.peerName,
        },
        anchor,
      },
    ];
  });
}

const CHIP_FIELDS = new Set([
  "participants",
  "extends",
  "amends",
  "relates",
  "tags",
  "owners",
  "reviewers",
]);

function formatMetadataLabel(key: string): string {
  return key.replace(/[-_]/g, " ");
}

function shouldRenderChips(field: MarkdownMetadataField): boolean {
  return field.values.length > 1 || CHIP_FIELDS.has(field.key.toLowerCase());
}

function MetadataPanel({ fields }: { fields: MarkdownMetadataField[] }) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <section className="markdown-metadata" aria-label="Metadata">
      <h2 className="markdown-metadata__title">Metadata</h2>
      <dl className="markdown-metadata__list">
        {fields.map((field) => (
          <div key={field.key} className="markdown-metadata__row">
            <dt className="markdown-metadata__key">
              {formatMetadataLabel(field.key)}
            </dt>
            <dd className="markdown-metadata__value">
              {shouldRenderChips(field) ? (
                <span className="markdown-metadata__chips">
                  {field.values.map((value) => (
                    <span key={value} className="markdown-metadata__chip">
                      {value}
                    </span>
                  ))}
                </span>
              ) : (
                <span>{field.values[0] ?? ""}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

type RestoreTabState = Pick<
  TabState,
  "directoryName" | "fileName" | "restoreError"
>;

interface MarkdownRendererContentProps {
  activeFilePath: string | null;
  fileName: string | null;
  hostTabId: string | null;
  isPeerMode: boolean;
  pendingScrollTarget: TabState["pendingScrollTarget"];
  rawContent: string;
  restoreTabState: RestoreTabState;
  writeAllowed: boolean;
}

function HostMarkdownRendererView() {
  const rawContent = useActiveTabField("rawContent") ?? "";
  const hostTabId = useActiveTabField("id") ?? null;
  const fileName = useActiveTabField("fileName") ?? null;
  const directoryName = useActiveTabField("directoryName") ?? null;
  const activeFilePath = useActiveTabField("activeFilePath") ?? null;
  const pendingScrollTarget = useActiveTabField("pendingScrollTarget") ?? null;
  const writeAllowed = useActiveTabField("writeAllowed") ?? false;
  const restoreError = useActiveTabField("restoreError") ?? null;

  return (
    <MarkdownRendererContent
      activeFilePath={activeFilePath}
      fileName={fileName}
      hostTabId={hostTabId}
      isPeerMode={false}
      pendingScrollTarget={pendingScrollTarget}
      rawContent={rawContent}
      restoreTabState={{ directoryName, fileName, restoreError }}
      writeAllowed={writeAllowed}
    />
  );
}

function PeerMarkdownRendererView() {
  const rawContent = useAppStore((s) => s.peerRawContent);
  const fileName = useAppStore((s) => s.peerFileName);
  const activeFilePath = useAppStore((s) => s.peerActiveFilePath);

  return (
    <MarkdownRendererContent
      activeFilePath={activeFilePath}
      fileName={fileName}
      hostTabId={null}
      isPeerMode
      pendingScrollTarget={null}
      rawContent={rawContent}
      restoreTabState={{
        directoryName: null,
        fileName: null,
        restoreError: null,
      }}
      writeAllowed
    />
  );
}

function MarkdownRendererContent({
  activeFilePath,
  fileName,
  hostTabId,
  isPeerMode,
  pendingScrollTarget,
  rawContent,
  restoreTabState,
  writeAllowed,
}: MarkdownRendererContentProps) {
  const setComments = useAppStore((s) => s.setComments);
  const addCommentAction = useAppStore((s) => s.addComment);
  const postPeerCommentAction = useAppStore((s) => s.postPeerComment);
  const reopenTab = useAppStore((s) => s.reopenTab);
  const openDirectoryInNewTab = useAppStore((s) => s.openDirectoryInNewTab);
  const openFileInNewTab = useAppStore((s) => s.openFileInNewTab);
  const clearPendingScrollTarget = useAppStore(
    (s) => s.clearPendingScrollTarget,
  );
  const setActiveCommentId = useAppStore((s) => s.setActiveCommentId);
  const showToast = useAppStore((s) => s.showToast);
  const hostActiveCommentId = useActiveTabField("activeCommentId") ?? null;
  const peerActiveCommentId = useAppStore((s) => s.peerActiveCommentId);
  const myPeerComments = useAppStore((s) => s.myPeerComments);
  const activeCommentId = isPeerMode
    ? peerActiveCommentId
    : hostActiveCommentId;
  const activeAgentRun = useAppStore((state) =>
    hostTabId ? getActiveAgentRunForTab(state, hostTabId) : null,
  );
  const shikiPlugin = useShikiRehypePlugin();
  const viewerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [hoveredBlock, setHoveredBlock] = useState<{
    index: number;
    top: number;
  } | null>(null);
  const [rangeCommentDraft, setRangeCommentDraft] =
    useState<RangeCommentDraft | null>(null);
  const agentBaselineRef = useRef<{ runId: string; blocks: string[] } | null>(
    null,
  );
  const [agentChangedBlocks, setAgentChangedBlocks] = useState<Set<number>>(
    new Set(),
  );
  const [specialBlockRevision, setSpecialBlockRevision] = useState(0);
  const showRestoreBanner =
    !isPeerMode && shouldRenderRestoreBanner(restoreTabState);

  const canComment = writeAllowed || isPeerMode;
  const shouldTrackHover = canComment;

  useEffect(() => {
    if (!activeAgentRun) {
      agentBaselineRef.current = null;
      setAgentChangedBlocks((currentBlocks) =>
        currentBlocks.size === 0 ? currentBlocks : new Set(),
      );
      return;
    }
    if (agentBaselineRef.current?.runId !== activeAgentRun.id) {
      agentBaselineRef.current = {
        runId: activeAgentRun.id,
        blocks: getCleanMarkdownBlocks(rawContent),
      };
      setAgentChangedBlocks((currentBlocks) =>
        currentBlocks.size === 0 ? currentBlocks : new Set(),
      );
      return;
    }
    const nextBlocks = getCleanMarkdownBlocks(rawContent);
    const changedBlocks = new Set<number>();
    const baselineBlocks = agentBaselineRef.current.blocks;
    const blockCount = Math.max(baselineBlocks.length, nextBlocks.length);
    for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
      if (baselineBlocks[blockIndex] !== nextBlocks[blockIndex]) {
        changedBlocks.add(blockIndex);
      }
    }
    setAgentChangedBlocks(changedBlocks);
  }, [activeAgentRun, rawContent]);

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

  // Footnote refs/backrefs navigate within the scroll pane. Letting the
  // browser follow them would write #user-content-fn… into the URL, which is
  // reserved for share links.
  const handleBodyClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target;
    if (!(target instanceof Element)) {
      return;
    }
    const footnoteLink = target.closest(
      "[data-footnote-ref], [data-footnote-backref]",
    );
    if (!(footnoteLink instanceof HTMLAnchorElement)) {
      return;
    }
    e.preventDefault();
    const hash = footnoteLink.getAttribute("href");
    if (!hash || !hash.startsWith("#")) {
      return;
    }
    const destination = document.getElementById(hash.slice(1));
    destination?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const handleBodyMouseUp = useCallback(() => {
    if (!canComment) {
      return;
    }
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const draft = captureRangeCommentDraft(selection);
    if (draft) {
      setRangeCommentDraft(draft);
    }
  }, [canComment]);

  const handleAddComment = useCallback(
    (
      blockIndex: number,
      type: string,
      text: string,
      anchor?: CommentAnchorDraft,
    ) => {
      if (!isCommentType(type)) {
        return;
      }
      void addCommentAction(blockIndex, type, text, anchor);
    },
    [addCommentAction],
  );

  const handlePostPeerComment = useCallback(
    (
      blockIndex: number,
      type: string,
      text: string,
      anchor?: CommentAnchorDraft,
    ) => {
      if (!isCommentType(type)) {
        return;
      }
      const path = activeFilePath ?? fileName ?? "";
      void postPeerCommentAction({
        blockIndex,
        type,
        text,
        path,
        anchor: anchor
          ? { quote: anchor.quote, occurrence: anchor.occurrence }
          : undefined,
      });
    },
    [postPeerCommentAction, activeFilePath, fileName],
  );

  // Strip CriticMarkup and collect comments with block indices
  const { cleanMarkdown, comments, metadata } = useMemo(() => {
    const document = parseMarkdownFrontmatter(rawContent);
    const parsed = parseCriticMarkup(document.body);
    const comments = assignBlockIndices(parsed.comments, parsed.cleanMarkdown);
    return {
      cleanMarkdown: parsed.cleanMarkdown,
      comments: shiftCommentRawOffsets(comments, document.bodyStart),
      metadata: document.metadata,
    };
  }, [rawContent]);
  const contentKey = useMemo(
    () =>
      `${activeFilePath ?? fileName ?? ""}:${cleanMarkdown.length}:${hashContentKey(cleanMarkdown)}`,
    [activeFilePath, fileName, cleanMarkdown],
  );
  const peerRangeComments = useMemo(
    () =>
      isPeerMode
        ? buildPeerRangeComments({
            comments: myPeerComments,
            activeFilePath,
            cleanMarkdown,
          })
        : [],
    [activeFilePath, cleanMarkdown, isPeerMode, myPeerComments],
  );
  const visibleRangeComments = isPeerMode ? peerRangeComments : comments;

  const handleSpecialBlockAnchor = useCallback(
    (blockIndex: number, anchor: CommentAnchorDraft) => {
      const block = bodyRef.current?.querySelector<HTMLElement>(
        `[data-block-index="${blockIndex}"]`,
      );
      if (!block) {
        return;
      }
      setRangeCommentDraft({
        blockIndex,
        top: block.offsetTop,
        anchor,
      });
    },
    [],
  );
  // Diagram/source choices survive the content-keyed remount of the markdown
  // subtree (indices may shift on structural edits, which resets the choice —
  // acceptable).
  const specialViewsRef = useRef(new Map<number, "diagram" | "source">());
  const specialBlockContext = useMemo<SpecialBlockContextValue>(
    () => ({
      activeCommentId,
      comments: visibleRangeComments,
      onCreateAnchor: handleSpecialBlockAnchor,
      onSelectComment: setActiveCommentId,
      onViewChange: (blockIndex, view) => {
        specialViewsRef.current.set(blockIndex, view);
        setSpecialBlockRevision((revision) => revision + 1);
      },
      specialViews: specialViewsRef.current,
    }),
    [
      activeCommentId,
      handleSpecialBlockAnchor,
      setActiveCommentId,
      visibleRangeComments,
    ],
  );

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }
    const blocks = body.querySelectorAll<HTMLElement>("[data-block-index]");
    for (const block of blocks) {
      const blockIndex = Number(block.dataset.blockIndex);
      if (agentChangedBlocks.has(blockIndex)) {
        block.dataset.agentChanged = "true";
      } else {
        delete block.dataset.agentChanged;
      }
    }
  }, [agentChangedBlocks, cleanMarkdown]);

  // null sentinel: the initial mount must push too — a restored tab arrives
  // with content already in place, and the margin/panel read the store.
  const prevCommentsRef = useRef<Comment[] | null>(null);
  useEffect(() => {
    if (!isPeerMode && prevCommentsRef.current !== comments) {
      prevCommentsRef.current = comments;
      setComments(comments);
    }
  }, [comments, isPeerMode, setComments]);

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

  // Hovering a rail card spotlights that comment: its own spans focus, every
  // other highlight washes out, so overlapping ranges stay tellable apart.
  // Comments without a range fall back to tinting the whole block.
  const hoveredBlockHighlight = useAppStore((s) => s.hoveredBlockHighlight);
  useEffect(() => {
    if (!hoveredBlockHighlight) {
      return;
    }
    const hoveredId = hoveredBlockHighlight.commentId;
    const body = bodyRef.current;
    const spans = hoveredId
      ? body?.querySelectorAll<HTMLElement>(".comment-highlight")
      : undefined;
    let spotlit = false;
    if (spans && hoveredId) {
      const color = COMMENT_TYPE_COLOR[hoveredBlockHighlight.commentType];
      const soloTint = `linear-gradient(color-mix(in srgb, ${color} 14%, transparent), color-mix(in srgb, ${color} 14%, transparent))`;
      for (const span of spans) {
        const covers = (span.dataset.cids ?? "").split(" ").includes(hoveredId);
        span.classList.toggle("comment-highlight--focus", covers);
        span.classList.toggle("comment-highlight--muted", !covers);
        if (covers) {
          // shared segments stack every covering comment's tint and stripe —
          // while spotlit, only the hovered comment may speak
          span.dataset.spotlightBackground = span.style.backgroundImage;
          span.dataset.spotlightShadow = span.style.boxShadow;
          span.style.backgroundImage = soloTint;
          span.style.boxShadow = `inset 0 -2px 0 ${color}`;
          spotlit = true;
        }
      }
      if (spotlit) {
        return () => {
          for (const span of spans) {
            span.classList.remove(
              "comment-highlight--focus",
              "comment-highlight--muted",
            );
            if (span.dataset.spotlightBackground !== undefined) {
              span.style.backgroundImage = span.dataset.spotlightBackground;
              delete span.dataset.spotlightBackground;
            }
            if (span.dataset.spotlightShadow !== undefined) {
              span.style.boxShadow = span.dataset.spotlightShadow;
              delete span.dataset.spotlightShadow;
            }
          }
        };
      }
    }
    // block-level fallback (no range, or range not rendered)
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

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }
    applyCommentHighlights({
      container: body,
      comments: visibleRangeComments,
      activeCommentId,
      onSelect: (commentId, sharedCount) => {
        setActiveCommentId(commentId);
        if (sharedCount > 1 && activeCommentId === null) {
          showToast(
            `${sharedCount} comments share this span — click again to cycle`,
          );
        }
      },
    });
    return () => removeCommentHighlights(body);
  }, [
    activeCommentId,
    contentKey,
    setActiveCommentId,
    showToast,
    specialBlockRevision,
    visibleRangeComments,
  ]);

  const rehypePlugins: PluggableList = shikiPlugin
    ? [rehypeBlockIndex, shikiPlugin]
    : [rehypeBlockIndex];

  return (
    <div className="markdown-scroll-area">
      {showRestoreBanner && hostTabId ? (
        <div className="restore-access-banner" role="status">
          <svg
            className="restore-access-banner__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <circle cx="11" cy="13" r="2.2" />
            <path d="M13.2 13h4.3m-1.8 0v2" />
          </svg>
          <span className="restore-access-banner__text">
            <strong>
              Live access to “{getRestoreWorkspaceName(restoreTabState)}” was
              dropped when the browser restarted.
            </strong>{" "}
            Keep reading — commenting and agent runs resume once access is
            restored.
          </span>
          <div className="restore-access-banner__actions">
            <button
              className="restore-access-banner__btn restore-access-banner__btn--primary"
              onClick={() => {
                void reopenTab(hostTabId);
              }}
            >
              Restore access
            </button>
            <button
              className="restore-access-banner__btn"
              onClick={() => {
                if (restoreTabState.directoryName) {
                  void openDirectoryInNewTab();
                  return;
                }
                void openFileInNewTab();
              }}
            >
              {getRestoreOpenOtherLabel(restoreTabState)}
            </button>
          </div>
        </div>
      ) : null}
      {!writeAllowed && !isPeerMode && !showRestoreBanner && (
        <div className="readonly-banner" role="status">
          Read-only — write permission was denied or the file is on a read-only
          filesystem. Comments cannot be saved to disk.
        </div>
      )}
      <div className="document-kicker">
        {activeFilePath ?? fileName ?? "Untitled document"}
      </div>
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
          selectionDraft={rangeCommentDraft}
          onDismissSelection={() => {
            setRangeCommentDraft(null);
            window.getSelection()?.removeAllRanges();
          }}
        />
        <div
          className="markdown-body"
          data-agent-status={activeAgentRun?.status}
          ref={bodyRef}
          onClick={handleBodyClick}
          onMouseOver={handleBodyMouseOver}
          onMouseUp={handleBodyMouseUp}
        >
          <MetadataPanel fields={metadata} />
          {/* Key by document identity + content: the highlight layer mutates
              text nodes inside this subtree, so React must never diff it in
              place across content changes — a changed key swaps the whole
              subtree, which only removes untouched root nodes. */}
          <div className="markdown-content" key={contentKey}>
            <SpecialBlockContext.Provider value={specialBlockContext}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={rehypePlugins}
                components={markdownComponents}
              >
                {cleanMarkdown}
              </ReactMarkdown>
            </SpecialBlockContext.Provider>
          </div>
        </div>
      </div>
    </div>
  );
}

export const MarkdownRenderer = memo(function MarkdownRenderer() {
  const isPeerMode = useAppStore((s) => s.isPeerMode);
  return isPeerMode ? (
    <PeerMarkdownRendererView />
  ) : (
    <HostMarkdownRendererView />
  );
});
