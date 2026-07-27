import { COMMENT_TYPE_COLOR } from "../types/criticmarkup";
import type { Comment } from "../types/criticmarkup";
import { getAnchorText, isIgnoredStructuralWhitespace } from "./domAnchorText";

export interface CommentHighlightSegment {
  start: number;
  end: number;
  comments: Comment[];
}

export function buildCommentHighlightSegments(
  textLength: number,
  comments: Comment[],
): CommentHighlightSegment[] {
  const anchoredComments = comments
    .filter(
      (comment) =>
        !!comment.anchor &&
        !comment.anchor.orphaned &&
        comment.anchor.start >= 0 &&
        comment.anchor.end > comment.anchor.start,
    )
    .sort((left, right) => {
      const startDifference =
        (left.anchor?.start ?? 0) - (right.anchor?.start ?? 0);
      return startDifference || left.rawStart - right.rawStart;
    });
  const boundaries = new Set<number>([0, textLength]);
  for (const comment of anchoredComments) {
    if (!comment.anchor) {
      continue;
    }
    boundaries.add(Math.max(0, Math.min(textLength, comment.anchor.start)));
    boundaries.add(Math.max(0, Math.min(textLength, comment.anchor.end)));
  }
  const orderedBoundaries = [...boundaries].sort((left, right) => left - right);
  const segments: CommentHighlightSegment[] = [];
  for (let index = 0; index < orderedBoundaries.length - 1; index += 1) {
    const start = orderedBoundaries[index];
    const end = orderedBoundaries[index + 1];
    const coveringComments = anchoredComments.filter(
      (comment) =>
        !!comment.anchor &&
        comment.anchor.start < end &&
        comment.anchor.end > start,
    );
    if (coveringComments.length > 0 && end > start) {
      segments.push({ start, end, comments: coveringComments });
    }
  }
  return segments;
}

function shouldSkipTextNode(textNode: Text): boolean {
  const parent = textNode.parentElement;
  return (
    !parent ||
    isIgnoredStructuralWhitespace(textNode) ||
    !!parent.closest("svg, button, .comment-highlight")
  );
}

function buildHighlightSpan(
  value: string,
  comments: Comment[],
  activeCommentId: string | null,
  onSelect: (commentId: string, sharedCount: number) => void,
): HTMLSpanElement {
  const span = document.createElement("span");
  const commentIds = comments.map((comment) => comment.id);
  span.className = "comment-highlight";
  span.textContent = value;
  span.dataset.cids = commentIds.join(" ");
  span.dataset.overlapCount = String(comments.length);
  const selectedComment = comments.find(
    (comment) => comment.id === activeCommentId,
  );
  span.dataset.selected = selectedComment ? "true" : "false";
  // the selection ring takes the selected comment's taxonomy color
  span.style.setProperty(
    "--hl-color",
    COMMENT_TYPE_COLOR[(selectedComment ?? comments[0]).type],
  );
  span.setAttribute("role", "button");
  span.tabIndex = 0;
  const labels = comments.map(
    (comment) => `${comment.type} by ${comment.thread?.authorLabel ?? "You"}`,
  );
  span.title = labels.join(", ");
  span.setAttribute(
    "aria-label",
    `${comments.length} ${comments.length === 1 ? "comment" : "comments"}: ${labels.join(", ")}; Enter to select or cycle`,
  );
  const cappedComments = comments.slice(0, 3);
  span.style.backgroundImage = cappedComments
    .map(
      (comment) =>
        `linear-gradient(color-mix(in srgb, ${COMMENT_TYPE_COLOR[comment.type]} 14%, transparent), color-mix(in srgb, ${COMMENT_TYPE_COLOR[comment.type]} 14%, transparent))`,
    )
    .join(", ");
  span.style.boxShadow = cappedComments
    .map(
      (comment, index) =>
        `inset 0 -${2 * (index + 1) + index}px 0 ${COMMENT_TYPE_COLOR[comment.type]}`,
    )
    .join(", ");
  function activate() {
    const currentIndex = activeCommentId
      ? commentIds.indexOf(activeCommentId)
      : -1;
    const nextIndex = (currentIndex + 1) % commentIds.length;
    onSelect(commentIds[nextIndex], commentIds.length);
  }
  span.addEventListener("click", (event) => {
    event.stopPropagation();
    activate();
  });
  span.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      activate();
    }
  });
  return span;
}

export function removeCommentHighlights(container: HTMLElement) {
  const highlights =
    container.querySelectorAll<HTMLElement>(".comment-highlight");
  for (const highlight of highlights) {
    highlight.replaceWith(document.createTextNode(highlight.textContent ?? ""));
  }
  container.normalize();
}

export function applyCommentHighlights(input: {
  container: HTMLElement;
  comments: Comment[];
  activeCommentId: string | null;
  onSelect: (commentId: string, sharedCount: number) => void;
}) {
  removeCommentHighlights(input.container);
  const commentsByBlock = new Map<number, Comment[]>();
  for (const comment of input.comments) {
    if (comment.blockIndex === undefined || !comment.anchor) {
      continue;
    }
    const blockComments = commentsByBlock.get(comment.blockIndex) ?? [];
    blockComments.push(comment);
    commentsByBlock.set(comment.blockIndex, blockComments);
  }

  for (const [blockIndex, blockComments] of commentsByBlock) {
    const block = input.container.querySelector<HTMLElement>(
      `[data-block-index="${blockIndex}"]`,
    );
    if (!block) {
      continue;
    }
    if (block.dataset.specialView === "diagram") {
      continue;
    }
    const anchorRoot =
      block.querySelector<HTMLElement>("[data-anchor-root]") ?? block;
    const segments = buildCommentHighlightSegments(
      getAnchorText(anchorRoot).length,
      blockComments,
    );
    if (segments.length === 0) {
      continue;
    }
    const walker = document.createTreeWalker(anchorRoot, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let currentNode = walker.nextNode();
    while (currentNode) {
      if (currentNode instanceof Text && !shouldSkipTextNode(currentNode)) {
        textNodes.push(currentNode);
      }
      currentNode = walker.nextNode();
    }
    let runningOffset = 0;
    for (const textNode of textNodes) {
      const value = textNode.data;
      const nodeStart = runningOffset;
      const nodeEnd = nodeStart + value.length;
      runningOffset = nodeEnd;
      const relevantSegments = segments.filter(
        (segment) => segment.start < nodeEnd && segment.end > nodeStart,
      );
      if (relevantSegments.length === 0) {
        continue;
      }
      const fragment = document.createDocumentFragment();
      let localCursor = 0;
      for (const segment of relevantSegments) {
        const localStart = Math.max(0, segment.start - nodeStart);
        const localEnd = Math.min(value.length, segment.end - nodeStart);
        if (localStart > localCursor) {
          fragment.append(value.slice(localCursor, localStart));
        }
        fragment.append(
          buildHighlightSpan(
            value.slice(localStart, localEnd),
            segment.comments,
            input.activeCommentId,
            input.onSelect,
          ),
        );
        localCursor = localEnd;
      }
      if (localCursor < value.length) {
        fragment.append(value.slice(localCursor));
      }
      textNode.replaceWith(fragment);
    }
  }
}
