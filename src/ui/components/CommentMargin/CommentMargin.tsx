import "./CommentMargin.css";
import { useEffect, useRef, useMemo, useState } from "react";
import {
  buildCommentThreadGroups,
  type CommentThreadGroup,
} from "../../../markup";
import { useActiveTabField } from "../../../store/selectors";
import { useCommentMarginStore } from "../../../store/uiHooks";
import type {
  Comment,
  CommentAnchorDraft,
  CommentType,
} from "../../../types/criticmarkup";
import type { PeerComment } from "../../../types/share";
import { AddCommentForm, type FloatingCardPosition } from "./AddCommentForm";
import { CommentMarkers, type DotGroup } from "./CommentMarkers";
import { shouldPreserveCommentMarginState } from "./commentMarginDismiss";
import { useCommentMarkerLayout } from "./useCommentMarkerLayout";

const EMPTY_COMMENTS: Comment[] = [];

interface FloatingCardDragState {
  offsetTop: number;
  offsetLeft: number;
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
  const {
    peerActiveCommentId: peerActiveId,
    peerCommentPanelOpen,
    setActiveCommentId: setActiveId,
    toggleCommentPanel,
    hostPendingPeerComments,
    documentUpdateAvailable,
    peerDraftCommentOpen,
    setPeerDraftCommentOpen,
    myPeerComments,
    peerActiveFilePath,
  } = useCommentMarginStore();
  const activeId = peerMode ? peerActiveId : hostActiveId;
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
      if (
        shouldPreserveCommentMarginState({
          event,
          containerRef,
          suppressSelectionClickRef,
        })
      ) {
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

  const { hoveredBlockAddTop, markerTops } = useCommentMarkerLayout({
    blockTops,
    groups,
    hoveredBlock,
    peerDotGroups,
  });

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
            style={{ top: hoveredBlockAddTop }}
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
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
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
      <CommentMarkers
        activeId={activeId}
        blockTops={blockTops}
        groups={groups}
        markerTops={markerTops}
        peerDotGroups={peerDotGroups}
        peerMode={peerMode}
        selectComment={selectComment}
      />
    </div>
  );
}
