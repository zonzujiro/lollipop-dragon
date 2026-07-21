import type { RefObject } from "react";

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

export function shouldPreserveCommentMarginState(input: {
  event: MouseEvent;
  containerRef: RefObject<HTMLDivElement | null>;
  suppressSelectionClickRef: RefObject<boolean>;
}): boolean {
  const target = input.event.target;
  if (target instanceof Element && target.closest(".comment-panel")) {
    return true;
  }

  const clickInsideViewer =
    target instanceof Node &&
    Boolean(input.containerRef.current?.contains(target));
  if (input.suppressSelectionClickRef.current && clickInsideViewer) {
    input.suppressSelectionClickRef.current = false;
    return true;
  }

  input.suppressSelectionClickRef.current = false;
  return hasSelectionInside(input.containerRef.current);
}
