import { type RefObject, useEffect, useRef } from "react";
import {
  applyCommentHighlights,
  removeCommentHighlights,
} from "../../../markup";
import type { PendingScrollTarget } from "../../../modules/host-review";
import type { Comment, CommentType } from "../../../types/criticmarkup";
import { COMMENT_TYPE_COLOR } from "../../../types/criticmarkup";

interface HoveredBlockHighlight {
  blockIndex: number;
  commentType: CommentType;
  commentId?: string;
}

export function useHostCommentSync(input: {
  comments: Comment[];
  isPeerMode: boolean;
  setComments: (comments: Comment[]) => void;
}): void {
  const { comments, isPeerMode, setComments } = input;
  const previousCommentsRef = useRef<Comment[] | null>(null);

  useEffect(() => {
    if (!isPeerMode && previousCommentsRef.current !== comments) {
      previousCommentsRef.current = comments;
      setComments(comments);
    }
  }, [comments, isPeerMode, setComments]);
}

export function usePendingCommentScroll(input: {
  activeFilePath: string | null;
  clearPendingScrollTarget: () => void;
  comments: Comment[];
  pendingScrollTarget: PendingScrollTarget | null;
  setActiveCommentId: (commentId: string | null) => void;
}): void {
  const {
    activeFilePath,
    clearPendingScrollTarget,
    comments,
    pendingScrollTarget,
    setActiveCommentId,
  } = input;

  useEffect(() => {
    if (
      !pendingScrollTarget ||
      pendingScrollTarget.filePath !== activeFilePath
    ) {
      return;
    }

    let scrollBlock: number | undefined;
    if (pendingScrollTarget.rawStart !== undefined) {
      const target = comments.find(
        (comment) => comment.rawStart === pendingScrollTarget.rawStart,
      );
      if (target) {
        setActiveCommentId(target.id);
        scrollBlock = target.blockIndex;
      }
    } else if (pendingScrollTarget.blockIndex !== undefined) {
      scrollBlock = pendingScrollTarget.blockIndex;
    }

    if (scrollBlock !== undefined) {
      const blockIndex = scrollBlock;
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-block-index="${blockIndex}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    clearPendingScrollTarget();
  }, [
    activeFilePath,
    clearPendingScrollTarget,
    comments,
    pendingScrollTarget,
    setActiveCommentId,
  ]);
}

function restoreSpotlightStyles(spans: NodeListOf<HTMLElement>): void {
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
}

function spotlightCommentRanges(input: {
  body: HTMLDivElement | null;
  highlight: HoveredBlockHighlight;
}): (() => void) | null {
  const hoveredId = input.highlight.commentId;
  const spans = hoveredId
    ? input.body?.querySelectorAll<HTMLElement>(".comment-highlight")
    : undefined;
  if (!spans || !hoveredId) {
    return null;
  }

  const color = COMMENT_TYPE_COLOR[input.highlight.commentType];
  const soloTint = `linear-gradient(color-mix(in srgb, ${color} 14%, transparent), color-mix(in srgb, ${color} 14%, transparent))`;
  let spotlit = false;
  for (const span of spans) {
    const covers = (span.dataset.cids ?? "").split(" ").includes(hoveredId);
    span.classList.toggle("comment-highlight--focus", covers);
    span.classList.toggle("comment-highlight--muted", !covers);
    if (covers) {
      span.dataset.spotlightBackground = span.style.backgroundImage;
      span.dataset.spotlightShadow = span.style.boxShadow;
      span.style.backgroundImage = soloTint;
      span.style.boxShadow = `inset 0 -2px 0 ${color}`;
      spotlit = true;
    }
  }
  return spotlit ? () => restoreSpotlightStyles(spans) : null;
}

export function useCommentHighlightLayer(input: {
  activeCommentId: string | null;
  bodyRef: RefObject<HTMLDivElement | null>;
  comments: Comment[];
  contentKey: string;
  hoveredBlockHighlight: HoveredBlockHighlight | null;
  revision: number;
  setActiveCommentId: (commentId: string | null) => void;
  showToast: (message: string) => void;
  viewerRef: RefObject<HTMLDivElement | null>;
}): void {
  const {
    activeCommentId,
    bodyRef,
    comments,
    contentKey,
    hoveredBlockHighlight,
    revision,
    setActiveCommentId,
    showToast,
    viewerRef,
  } = input;

  useEffect(() => {
    if (!hoveredBlockHighlight) {
      return;
    }
    const cleanupRangeSpotlight = spotlightCommentRanges({
      body: bodyRef.current,
      highlight: hoveredBlockHighlight,
    });
    if (cleanupRangeSpotlight) {
      return cleanupRangeSpotlight;
    }

    const block = viewerRef.current?.querySelector(
      `[data-block-index="${hoveredBlockHighlight.blockIndex}"]`,
    );
    if (!(block instanceof HTMLElement)) {
      return;
    }
    block.setAttribute(
      "data-highlight-type",
      hoveredBlockHighlight.commentType,
    );
    return () => {
      block.removeAttribute("data-highlight-type");
    };
  }, [bodyRef, hoveredBlockHighlight, viewerRef]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) {
      return;
    }
    applyCommentHighlights({
      container: body,
      comments,
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
    bodyRef,
    comments,
    contentKey,
    revision,
    setActiveCommentId,
    showToast,
  ]);
}
