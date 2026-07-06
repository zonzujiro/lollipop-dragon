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
import { CommentThreadCard } from "../CommentThreadCard";
import { peerColor, initials } from "../../../utils/peerDisplay";
import { COMMENT_TYPE_COLOR } from "../../../types/criticmarkup";
import type { Comment, CommentType } from "../../../types/criticmarkup";
import type { PeerComment } from "../../../types/share";

const COMMENT_TYPES: CommentType[] = [
  "note",
  "fix",
  "rewrite",
  "expand",
  "clarify",
  "question",
  "remove",
];

const EMPTY_COMMENTS: Comment[] = [];
const EMPTY_PEER_COMMENTS: PeerComment[] = [];

interface AddCommentFormProps {
  top: number;
  onSubmit: (type: CommentType, text: string) => void;
  onCancel: () => void;
  disabled?: boolean;
}

function AddCommentForm({
  top,
  onSubmit,
  onCancel,
  disabled = false,
}: AddCommentFormProps) {
  const [type, setType] = useState<CommentType>("note");
  const [text, setText] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!text.trim()) {
      return;
    }
    onSubmit(type, text.trim());
  }

  return (
    <form
      className="comment-add-form"
      style={{ top }}
      onSubmit={handleSubmit}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="comment-add-form__header">
        <span className="comment-add-form__title">Add comment</span>
        <span className="comment-add-form__meta">{type}</span>
      </div>
      <div className="comment-add-form__types">
        {COMMENT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={`comment-add-form__type${type === t ? " comment-add-form__type--active" : ""}`}
            aria-pressed={type === t}
            onClick={() => setType(t)}
            disabled={disabled}
          >
            {t}
          </button>
        ))}
      </div>
      <textarea
        className="comment-add-form__input"
        placeholder="Add a comment…"
        aria-label="Comment text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        autoFocus
        disabled={disabled}
      />
      <div className="comment-add-form__actions">
        <button
          type="submit"
          className="comment-add-form__save"
          disabled={disabled || !text.trim()}
        >
          Save
        </button>
        <button
          type="button"
          className="comment-add-form__cancel"
          onClick={onCancel}
        >
          Cancel
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

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>;
  hoveredBlock: { index: number; top: number } | null;
  onAddComment: (blockIndex: number, type: CommentType, text: string) => void;
  peerMode?: boolean;
  onPostPeerComment?: (
    blockIndex: number,
    type: CommentType,
    text: string,
  ) => void;
}

export function CommentMargin({
  containerRef,
  hoveredBlock,
  onAddComment,
  peerMode,
  onPostPeerComment,
}: Props) {
  const editCommentAction = useAppStore((s) => s.editComment);
  const deleteCommentAction = useAppStore((s) => s.deleteComment);
  const replyToCommentThreadAction = useAppStore((s) => s.replyToCommentThread);
  const [addingBlock, setAddingBlock] = useState<{
    index: number;
    top: number;
  } | null>(null);
  const allComments = useActiveTabField("comments") ?? EMPTY_COMMENTS;
  const commentFilter = useActiveTabField("commentFilter") ?? "all";
  const activeId = useActiveTabField("activeCommentId") ?? null;
  const setActiveId = useAppStore((s) => s.setActiveCommentId);
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
  const [floatingTop, setFloatingTop] = useState<number | null>(null);
  const [floatingCardPosition, setFloatingCardPosition] =
    useState<FloatingCardPosition | null>(null);
  const [floatingCardDragState, setFloatingCardDragState] =
    useState<FloatingCardDragState | null>(null);
  const measureRef = useRef<() => void>(() => {});
  const activeCardRef = useRef<HTMLDivElement | null>(null);

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
    const onDocClick = () => setActiveId(null);
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [setActiveId]);

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

  const activeThreadData = useMemo(() => {
    for (const group of groups) {
      const activeThread =
        group.threads.find(
          (thread) =>
            thread.root.id === activeId ||
            thread.replies.some((reply) => reply.id === activeId),
        ) ?? null;
      if (activeThread) {
        return { top: group.top, thread: activeThread };
      }
    }
    return null;
  }, [activeId, groups]);

  useEffect(() => {
    if (!activeThreadData) {
      setFloatingTop(null);
      return;
    }

    function updateFloatingTop() {
      const viewer = containerRef.current;
      const card = activeCardRef.current;
      const scrollArea = viewer?.parentElement;
      if (!viewer || !card || !(scrollArea instanceof HTMLElement)) {
        setFloatingTop(activeThreadData.top);
        return;
      }

      const padding = 8;
      const preferredTop = activeThreadData.top;
      const visibleTop = scrollArea.scrollTop + padding;
      const visibleBottom = scrollArea.scrollTop + scrollArea.clientHeight;
      const maxTop = Math.max(
        visibleTop,
        visibleBottom - card.offsetHeight - padding,
      );

      setFloatingTop(Math.min(Math.max(preferredTop, visibleTop), maxTop));
    }

    updateFloatingTop();

    const viewer = containerRef.current;
    const scrollArea = viewer?.parentElement;
    if (!(scrollArea instanceof HTMLElement)) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => updateFloatingTop());
    resizeObserver.observe(scrollArea);
    if (activeCardRef.current) {
      resizeObserver.observe(activeCardRef.current);
    }

    scrollArea.addEventListener("scroll", updateFloatingTop, {
      passive: true,
    });
    window.addEventListener("resize", updateFloatingTop);

    return () => {
      resizeObserver.disconnect();
      scrollArea.removeEventListener("scroll", updateFloatingTop);
      window.removeEventListener("resize", updateFloatingTop);
    };
  }, [activeThreadData, containerRef]);

  useEffect(() => {
    setFloatingCardPosition(null);
    setFloatingCardDragState(null);
  }, [activeId]);

  useEffect(() => {
    if (!floatingCardDragState) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const card = activeCardRef.current;
      if (!card) {
        return;
      }
      if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
        return;
      }
      const padding = 8;
      const maxLeft = Math.max(
        padding,
        window.innerWidth - card.offsetWidth - padding,
      );
      const maxTop = Math.max(
        padding,
        window.innerHeight - card.offsetHeight - padding,
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

  function handleFloatingCardDragStart(event: React.PointerEvent) {
    if (event.button > 0) {
      return;
    }
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
      return;
    }
    const card = activeCardRef.current;
    if (!card) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const rect = card.getBoundingClientRect();
    setFloatingCardPosition({
      top: rect.top,
      left: rect.left,
    });
    setFloatingCardDragState({
      offsetTop: event.clientY - rect.top,
      offsetLeft: event.clientX - rect.left,
    });
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
                setAddingBlock(hoveredBlock);
                if (peerMode) {
                  setPeerDraftCommentOpen(true);
                }
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          </div>
        )}
      {addingBlock && (
        <AddCommentForm
          top={addingBlock.top}
          onSubmit={(type, text) => {
            if (peerMode && onPostPeerComment) {
              onPostPeerComment(addingBlock.index, type, text);
              setPeerDraftCommentOpen(false);
            } else {
              onAddComment(addingBlock.index, type, text);
            }
            setAddingBlock(null);
          }}
          onCancel={() => {
            if (peerMode) {
              setPeerDraftCommentOpen(false);
            }
            setAddingBlock(null);
          }}
          disabled={peerMode && documentUpdateAvailable}
        />
      )}
      {groups.map(({ top, threads }, i) => {
        const activeThread =
          threads.find(
            (thread) =>
              thread.root.id === activeId ||
              thread.replies.some((reply) => reply.id === activeId),
          ) ?? null;
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
                  <button
                    key={thread.root.id}
                    className={`comment-margin__dot${isActive ? " comment-margin__dot--active" : ""}`}
                    style={{
                      backgroundColor: COMMENT_TYPE_COLOR[thread.root.type],
                    }}
                    aria-label={`${thread.root.type}: ${thread.root.text}`}
                    title={`${thread.root.type}: ${thread.root.text}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveId(isActive ? null : thread.root.id);
                    }}
                  />
                );
              })}
              {peerForBlock.map((pc) => (
                <button
                  key={pc.id}
                  className="comment-margin__peer-dot"
                  style={{ backgroundColor: peerColor(pc.peerName) }}
                  title={`${pc.peerName}: ${pc.text}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    document
                      .querySelector(
                        `[data-block-index="${pc.blockRef.blockIndex}"]`,
                      )
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  {initials(pc.peerName)[0]}
                </button>
              ))}
            </div>
            {activeThread && (
              <CommentThreadCard
                thread={activeThread}
                top={floatingTop ?? top}
                dragPosition={floatingCardPosition}
                dragging={!!floatingCardDragState}
                cardRef={activeCardRef}
                onDragStart={handleFloatingCardDragStart}
                onClose={() => setActiveId(null)}
                onEdit={(id, type, text) => {
                  editCommentAction(id, type, text).catch((error) => {
                    console.error(
                      "[CommentMargin] failed to edit comment:",
                      error,
                    );
                  });
                }}
                onDelete={(id) => {
                  deleteCommentAction(id).catch((error) => {
                    console.error(
                      "[CommentMargin] failed to delete comment:",
                      error,
                    );
                  });
                  setActiveId(null);
                }}
                onReply={(rootCommentId, text) => {
                  replyToCommentThreadAction(rootCommentId, text).catch(
                    (error) => {
                      console.error(
                        "[CommentMargin] failed to reply to thread:",
                        error,
                      );
                    },
                  );
                }}
              />
            )}
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
              {peerComments.map((pc) => (
                <button
                  key={pc.id}
                  className="comment-margin__peer-dot"
                  style={{ backgroundColor: peerColor(pc.peerName) }}
                  title={`${pc.peerName}: ${pc.text}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    document
                      .querySelector(
                        `[data-block-index="${pc.blockRef.blockIndex}"]`,
                      )
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  {initials(pc.peerName)[0]}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
