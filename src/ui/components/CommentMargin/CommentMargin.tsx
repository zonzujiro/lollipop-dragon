import "./CommentMargin.css";
import { useEffect, useRef, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  buildCommentThreadGroups,
  type CommentThreadGroup,
} from "../../../markup";
import { useAppStore } from "../../../store";
import { getActiveTab, useActiveTabField } from "../../../store/selectors";
import { selectDocumentUpdateAvailable } from "../../../modules/relay";
import { selectPeerDraftCommentOpen } from "../../../modules/peer-review";
import { peerColor, initials } from "../../../utils/peerDisplay";
import type {
  Comment,
  CommentAnchorDraft,
  CommentType,
} from "../../../types/criticmarkup";
import type { PeerComment } from "../../../types/share";
import {
  DEFAULT_USER_COMMENT_TYPE,
  USER_COMMENT_TYPES,
} from "../../commentTypes";

const EMPTY_COMMENTS: Comment[] = [];
const EMPTY_PEER_COMMENTS: PeerComment[] = [];
const COMMENT_TYPE_HINTS: Record<CommentType, string> = {
  fix: "something is wrong — correct it",
  rewrite: "right idea, wrong words",
  expand: "true but incomplete — go deeper",
  clarify: "ambiguous — make it precise",
  question: "needs an answer, opens a thread",
  answer: "provide a direct answer",
  note: "add context for the reviewer",
  remove: "doesn’t belong — cut it",
};

interface AddCommentFormProps {
  top: number;
  dragPosition?: FloatingCardPosition | null;
  dragging?: boolean;
  formRef?: React.RefObject<HTMLFormElement | null>;
  onDragStart?: (event: React.PointerEvent) => void;
  onSubmit: (type: CommentType, text: string) => void;
  onCancel: () => void;
  disabled?: boolean;
  anchor?: CommentAnchorDraft;
  peerMode?: boolean;
}

function AddCommentForm({
  top,
  dragPosition = null,
  dragging = false,
  formRef,
  onDragStart,
  onSubmit,
  onCancel,
  disabled = false,
  anchor,
  peerMode = false,
}: AddCommentFormProps) {
  const [type, setType] = useState<CommentType>(DEFAULT_USER_COMMENT_TYPE);
  const [text, setText] = useState("");
  const formStyle: React.CSSProperties = dragPosition
    ? {
        position: "fixed",
        top: dragPosition.top,
        left: dragPosition.left,
      }
    : { top };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!text.trim()) {
      return;
    }
    onSubmit(type, text.trim());
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (text.trim()) {
        onSubmit(type, text.trim());
      }
      return;
    }
    if (event.target instanceof HTMLTextAreaElement) {
      return;
    }
    const typeIndex = Number(event.key) - 1;
    const selectedType = USER_COMMENT_TYPES[typeIndex];
    if (selectedType) {
      event.preventDefault();
      setType(selectedType);
    }
  }

  return (
    <form
      ref={formRef}
      className={`comment-add-form${dragging ? " comment-add-form--dragging" : ""}`}
      data-comment-type={type}
      style={formStyle}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="comment-add-form__drag-handle"
        onPointerDown={onDragStart}
        title="Drag comment panel"
      >
        <span aria-hidden="true" />
      </div>
      {anchor && (
        <blockquote className="comment-add-form__quote">
          “{anchor.quote}”
        </blockquote>
      )}
      <div className="comment-add-form__types">
        {USER_COMMENT_TYPES.map((commentType, index) => (
          <button
            key={commentType}
            type="button"
            className={`comment-add-form__type${type === commentType ? " comment-add-form__type--active" : ""}`}
            data-comment-type={commentType}
            aria-pressed={type === commentType}
            onClick={() => setType(commentType)}
            disabled={disabled}
          >
            {type === commentType && (
              <span
                className="comment-add-form__type-mark"
                aria-hidden="true"
              />
            )}
            {commentType}
            <kbd>{index + 1}</kbd>
          </button>
        ))}
      </div>
      <textarea
        className="comment-add-form__input"
        placeholder={`${COMMENT_TYPE_HINTS[type]}…`}
        aria-label="Comment text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        autoFocus
        disabled={disabled}
      />
      <div className="comment-add-form__actions">
        <span className="comment-add-form__honesty">
          {peerMode
            ? "Sent to the host — encrypted"
            : "Written into the file as CriticMarkup"}
        </span>
        <button
          type="submit"
          className="comment-add-form__save"
          disabled={disabled || !text.trim()}
          aria-label="Save"
        >
          Comment <kbd>⌘↵</kbd>
        </button>
      </div>
    </form>
  );
}

interface DotGroup {
  top: number;
  threads: CommentThreadGroup[];
}

interface FloatingCardPosition {
  top: number;
  left: number;
}

interface FloatingCardDragState {
  offsetTop: number;
  offsetLeft: number;
}

interface CommentMarkerProps {
  active: boolean;
  label: string;
  type: CommentType;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

function CommentMarker({ active, label, type, onClick }: CommentMarkerProps) {
  return (
    <button
      className={`comment-margin__dot${active ? " comment-margin__dot--active" : ""}`}
      data-comment-type={type}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <span className="comment-margin__dot-mark" aria-hidden="true" />
    </button>
  );
}

function hasSelectionInside(container: HTMLElement | null): boolean {
  const selection = window.getSelection();
  if (!container || !selection || selection.isCollapsed) {
    return false;
  }
  const anchorInside = selection.anchorNode
    ? container.contains(selection.anchorNode)
    : false;
  const focusInside = selection.focusNode
    ? container.contains(selection.focusNode)
    : false;
  return anchorInside || focusInside;
}

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>;
  hoveredBlock: { index: number; top: number } | null;
  onAddComment: (
    blockIndex: number,
    type: CommentType,
    text: string,
    anchor?: CommentAnchorDraft,
  ) => void;
  peerMode?: boolean;
  onPostPeerComment?: (
    blockIndex: number,
    type: CommentType,
    text: string,
    anchor?: CommentAnchorDraft,
  ) => void;
  selectionDraft?: {
    blockIndex: number;
    top: number;
    anchor: CommentAnchorDraft;
  } | null;
  onDismissSelection?: () => void;
}

export function CommentMargin({
  containerRef,
  hoveredBlock,
  onAddComment,
  peerMode,
  onPostPeerComment,
  selectionDraft = null,
  onDismissSelection,
}: Props) {
  const [addingBlock, setAddingBlock] = useState<{
    index: number;
    top: number;
    anchor?: CommentAnchorDraft;
  } | null>(null);
  const hostComments = useActiveTabField("comments") ?? EMPTY_COMMENTS;
  const allComments = peerMode ? EMPTY_COMMENTS : hostComments;
  const hostCommentFilter = useActiveTabField("commentFilter") ?? "all";
  const commentFilter = peerMode ? "all" : hostCommentFilter;
  const hostActiveId = useActiveTabField("activeCommentId") ?? null;
  const hostCommentPanelOpen = useActiveTabField("commentPanelOpen") ?? false;
  const peerActiveId = useAppStore((state) => state.peerActiveCommentId);
  const peerCommentPanelOpen = useAppStore(
    (state) => state.peerCommentPanelOpen,
  );
  const activeId = peerMode ? peerActiveId : hostActiveId;
  const setActiveId = useAppStore((s) => s.setActiveCommentId);
  const toggleCommentPanel = useAppStore((state) => state.toggleCommentPanel);
  const hostPendingPeerComments = useAppStore(
    useShallow((state) => {
      const tab = getActiveTab(state);
      if (!tab?.activeDocId) {
        return EMPTY_PEER_COMMENTS;
      }
      const pendingComments =
        tab.pendingComments[tab.activeDocId] ?? EMPTY_PEER_COMMENTS;
      if (pendingComments.length === 0) {
        return EMPTY_PEER_COMMENTS;
      }
      const currentPath = tab.activeFilePath ?? tab.fileName ?? "";
      if (!currentPath) {
        return pendingComments;
      }
      const visibleComments = pendingComments.filter(
        (comment) => comment.path === currentPath,
      );
      return visibleComments.length > 0 ? visibleComments : EMPTY_PEER_COMMENTS;
    }),
  );
  const documentUpdateAvailable = useAppStore(selectDocumentUpdateAvailable);
  const peerDraftCommentOpen = useAppStore(selectPeerDraftCommentOpen);
  const setPeerDraftCommentOpen = useAppStore(
    (state) => state.setPeerDraftCommentOpen,
  );
  const [blockTops, setBlockTops] = useState<Map<number, number>>(new Map());
  // 'resolved' means the comments are gone from the file — no dots to show.
  // 'pending' is the same as 'all' for current (still-in-file) comments.
  const allThreadGroups = useMemo(
    () => buildCommentThreadGroups(allComments),
    [allComments],
  );
  const threadGroups = useMemo(
    () =>
      commentFilter === "all" ||
      commentFilter === "pending" ||
      commentFilter === "resolved"
        ? commentFilter === "resolved"
          ? []
          : allThreadGroups
        : allThreadGroups.filter(
            (thread) => thread.root.type === commentFilter,
          ),
    [allThreadGroups, commentFilter],
  );
  const [groups, setGroups] = useState<DotGroup[]>([]);
  const [floatingCardPosition, setFloatingCardPosition] =
    useState<FloatingCardPosition | null>(null);
  const [floatingCardDragState, setFloatingCardDragState] =
    useState<FloatingCardDragState | null>(null);
  const measureRef = useRef<() => void>(() => {});
  const addFormRef = useRef<HTMLFormElement | null>(null);
  const suppressSelectionClickRef = useRef(false);

  useEffect(() => {
    if (!selectionDraft) {
      return;
    }
    suppressSelectionClickRef.current = true;
    setActiveId(null);
    setAddingBlock({
      index: selectionDraft.blockIndex,
      top: selectionDraft.top,
      anchor: selectionDraft.anchor,
    });
    if (peerMode) {
      setPeerDraftCommentOpen(true);
    }
  }, [peerMode, selectionDraft, setActiveId, setPeerDraftCommentOpen]);

  // In peer mode, show the peer's own comments as dots
  const myPeerComments = useAppStore((s) => s.myPeerComments);
  const peerActiveFilePath = useAppStore((s) => s.peerActiveFilePath);

  // Peer comments for the current file, grouped by blockIndex
  const peerDotGroups = useMemo(() => {
    if (peerMode) {
      const currentPath = peerActiveFilePath ?? "";
      const forFile = currentPath
        ? myPeerComments.filter((comment) => comment.path === currentPath)
        : myPeerComments;
      const byBlock = new Map<number, PeerComment[]>();
      for (const comment of forFile) {
        const idx = comment.blockRef.blockIndex;
        const arr = byBlock.get(idx) ?? [];
        arr.push(comment);
        byBlock.set(idx, arr);
      }
      return byBlock;
    }
    // Host sees pending peer comments
    if (hostPendingPeerComments.length === 0) {
      return new Map<number, PeerComment[]>();
    }
    const byBlock = new Map<number, PeerComment[]>();
    for (const comment of hostPendingPeerComments) {
      const idx = comment.blockRef.blockIndex;
      const arr = byBlock.get(idx) ?? [];
      arr.push(comment);
      byBlock.set(idx, arr);
    }
    return byBlock;
  }, [peerMode, myPeerComments, peerActiveFilePath, hostPendingPeerComments]);

  // Close card when clicking outside
  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      const target = event.target;
      const clickInsideViewer =
        target instanceof Node &&
        Boolean(containerRef.current?.contains(target));
      if (suppressSelectionClickRef.current && clickInsideViewer) {
        suppressSelectionClickRef.current = false;
        return;
      }
      suppressSelectionClickRef.current = false;
      if (hasSelectionInside(containerRef.current)) {
        return;
      }
      setActiveId(null);
      setAddingBlock(null);
      onDismissSelection?.();
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [containerRef, onDismissSelection, setActiveId]);

  useEffect(() => {
    function openComposer(event: Event) {
      if (!(event instanceof CustomEvent)) {
        return;
      }
      const detail: unknown = event.detail;
      if (!detail || typeof detail !== "object" || !("blockIndex" in detail)) {
        return;
      }
      const blockIndex = detail.blockIndex;
      if (typeof blockIndex !== "number") {
        return;
      }
      const block = containerRef.current?.querySelector<HTMLElement>(
        `[data-block-index="${blockIndex}"]`,
      );
      if (!block) {
        return;
      }
      setActiveId(null);
      setAddingBlock({ index: blockIndex, top: block.offsetTop });
    }
    function closeTopLayer(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== "Escape") {
        return;
      }
      if (addingBlock) {
        event.preventDefault();
        setAddingBlock(null);
        onDismissSelection?.();
        return;
      }
      if (activeId) {
        event.preventDefault();
        setActiveId(null);
      }
    }
    window.addEventListener("markreview:open-composer", openComposer);
    window.addEventListener("keydown", closeTopLayer);
    return () => {
      window.removeEventListener("markreview:open-composer", openComposer);
      window.removeEventListener("keydown", closeTopLayer);
    };
  }, [activeId, addingBlock, containerRef, onDismissSelection, setActiveId]);

  useEffect(() => {
    return () => {
      if (peerMode) {
        setPeerDraftCommentOpen(false);
      }
    };
  }, [peerMode, setPeerDraftCommentOpen]);

  useEffect(() => {
    if (peerMode && addingBlock && !peerDraftCommentOpen) {
      setAddingBlock(null);
    }
  }, [addingBlock, peerDraftCommentOpen, peerMode]);

  useEffect(() => {
    measureRef.current = () => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const byBlock = new Map<number, CommentThreadGroup[]>();
      for (const thread of threadGroups) {
        if (thread.root.blockIndex === undefined) {
          continue;
        }
        const threadsForBlock = byBlock.get(thread.root.blockIndex) ?? [];
        threadsForBlock.push(thread);
        byBlock.set(thread.root.blockIndex, threadsForBlock);
      }
      for (const threadsForBlock of byBlock.values()) {
        threadsForBlock.sort((leftThread, rightThread) => {
          const leftStart = leftThread.root.anchor?.start ?? -1;
          const rightStart = rightThread.root.anchor?.start ?? -1;
          return leftStart - rightStart;
        });
      }

      const next: DotGroup[] = [];
      const tops = new Map<number, number>();
      const blocks =
        container.querySelectorAll<HTMLElement>("[data-block-index]");
      for (const el of blocks) {
        const idx = Number(el.getAttribute("data-block-index"));
        tops.set(idx, el.offsetTop);
        const group = byBlock.get(idx);
        if (!group) {
          continue;
        }
        next.push({ top: el.offsetTop, threads: group });
      }
      setGroups(next);
      setBlockTops(tops);
    };

    measureRef.current();

    const container = containerRef.current;
    if (!container) {
      return;
    }
    const ro = new ResizeObserver(() => measureRef.current());
    ro.observe(container);
    return () => ro.disconnect();
  }, [containerRef, threadGroups]);

  const addingBlockIndex = addingBlock?.index ?? null;

  useEffect(() => {
    setFloatingCardPosition(null);
    setFloatingCardDragState(null);
  }, [addingBlockIndex]);

  useEffect(() => {
    if (!floatingCardDragState) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const popup = addFormRef.current;
      if (!popup) {
        return;
      }
      if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
        return;
      }
      const padding = 8;
      const maxLeft = Math.max(
        padding,
        window.innerWidth - popup.offsetWidth - padding,
      );
      const maxTop = Math.max(
        padding,
        window.innerHeight - popup.offsetHeight - padding,
      );
      const nextLeft = Math.min(
        Math.max(event.clientX - floatingCardDragState.offsetLeft, padding),
        maxLeft,
      );
      const nextTop = Math.min(
        Math.max(event.clientY - floatingCardDragState.offsetTop, padding),
        maxTop,
      );
      setFloatingCardPosition({
        top: nextTop,
        left: nextLeft,
      });
    }

    function handlePointerUp() {
      setFloatingCardDragState(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [floatingCardDragState]);

  function handleComposerDragStart(event: React.PointerEvent) {
    if (event.button > 0) {
      return;
    }
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
      return;
    }
    const popup = addFormRef.current;
    if (!popup) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const rect = popup.getBoundingClientRect();
    setFloatingCardPosition({
      top: rect.top,
      left: rect.left,
    });
    setFloatingCardDragState({
      offsetTop: event.clientY - rect.top,
      offsetLeft: event.clientX - rect.left,
    });
  }

  function selectComment(commentId: string) {
    const commentPanelOpen = peerMode
      ? peerCommentPanelOpen
      : hostCommentPanelOpen;
    if (!commentPanelOpen) {
      toggleCommentPanel();
    }
    setAddingBlock(null);
    if (peerMode) {
      setPeerDraftCommentOpen(false);
    }
    setActiveId(commentId);
  }

  return (
    <div className="comment-margin">
      {hoveredBlock &&
        !addingBlock &&
        !(peerMode && documentUpdateAvailable) && (
          <div
            className="comment-margin__add-wrapper"
            style={{ top: hoveredBlock.top }}
          >
            <button
              className="comment-margin__add"
              aria-label="Add comment"
              onClick={(e) => {
                e.stopPropagation();
                setActiveId(null);
                setAddingBlock(hoveredBlock);
                if (peerMode) {
                  setPeerDraftCommentOpen(true);
                }
              }}
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>
        )}
      {addingBlock && (
        <AddCommentForm
          top={addingBlock.top}
          dragPosition={floatingCardPosition}
          dragging={!!floatingCardDragState}
          formRef={addFormRef}
          onDragStart={handleComposerDragStart}
          onSubmit={(type, text) => {
            if (peerMode && onPostPeerComment) {
              onPostPeerComment(
                addingBlock.index,
                type,
                text,
                addingBlock.anchor,
              );
              setPeerDraftCommentOpen(false);
            } else {
              if (addingBlock.anchor) {
                onAddComment(addingBlock.index, type, text, addingBlock.anchor);
              } else {
                onAddComment(addingBlock.index, type, text);
              }
            }
            setAddingBlock(null);
            onDismissSelection?.();
          }}
          onCancel={() => {
            if (peerMode) {
              setPeerDraftCommentOpen(false);
            }
            setAddingBlock(null);
            onDismissSelection?.();
          }}
          disabled={peerMode && documentUpdateAvailable}
          anchor={addingBlock.anchor}
          peerMode={peerMode}
        />
      )}
      {groups.map(({ top, threads }, i) => {
        // Find peer comments for the same block
        const blockIdx = threads[0]?.root.blockIndex;
        const peerForBlock =
          blockIdx !== undefined ? (peerDotGroups.get(blockIdx) ?? []) : [];
        return (
          <div key={i}>
            <div className="comment-margin__dots" style={{ top }}>
              {threads.map((thread) => {
                const isActive =
                  thread.root.id === activeId ||
                  thread.replies.some((reply) => reply.id === activeId);
                return (
                  <CommentMarker
                    key={thread.root.id}
                    active={isActive}
                    type={thread.root.type}
                    label={`${thread.root.type}: ${thread.root.text}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectComment(thread.root.id);
                    }}
                  />
                );
              })}
              {peerForBlock.map((peerComment) =>
                peerMode ? (
                  <CommentMarker
                    key={peerComment.id}
                    active={peerComment.id === activeId}
                    type={peerComment.commentType}
                    label={`${peerComment.commentType}: ${peerComment.text}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      selectComment(peerComment.id);
                    }}
                  />
                ) : (
                  <button
                    key={peerComment.id}
                    className="comment-margin__peer-dot"
                    style={{ backgroundColor: peerColor(peerComment.peerName) }}
                    title={`${peerComment.peerName}: ${peerComment.text}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      document
                        .querySelector(
                          `[data-block-index="${peerComment.blockRef.blockIndex}"]`,
                        )
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                    }}
                  >
                    {initials(peerComment.peerName)[0]}
                  </button>
                ),
              )}
            </div>
          </div>
        );
      })}
      {/* Peer-only blocks (no host comments at this block) */}
      {Array.from(peerDotGroups.entries()).map(([blockIdx, peerComments]) => {
        // Skip blocks already rendered with host groups
        if (
          groups.some((group) => group.threads[0]?.root.blockIndex === blockIdx)
        ) {
          return null;
        }
        const top = blockTops.get(blockIdx);
        if (top == null) {
          return null;
        }
        return (
          <div key={`peer-${blockIdx}`}>
            <div className="comment-margin__dots" style={{ top }}>
              {peerComments.map((peerComment) =>
                peerMode ? (
                  <CommentMarker
                    key={peerComment.id}
                    active={peerComment.id === activeId}
                    type={peerComment.commentType}
                    label={`${peerComment.commentType}: ${peerComment.text}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      selectComment(peerComment.id);
                    }}
                  />
                ) : (
                  <button
                    key={peerComment.id}
                    className="comment-margin__peer-dot"
                    style={{ backgroundColor: peerColor(peerComment.peerName) }}
                    title={`${peerComment.peerName}: ${peerComment.text}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      document
                        .querySelector(
                          `[data-block-index="${peerComment.blockRef.blockIndex}"]`,
                        )
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                    }}
                  >
                    {initials(peerComment.peerName)[0]}
                  </button>
                ),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
