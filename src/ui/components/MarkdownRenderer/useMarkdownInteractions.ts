import {
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useState,
} from "react";
import { findQuoteOccurrences } from "../../../markup";
import type { CommentAnchorDraft } from "../../../types/criticmarkup";

export interface RangeCommentDraft {
  blockIndex: number;
  top: number;
  anchor: CommentAnchorDraft;
}

// A captured selection awaiting an explicit "Comment" action. Selecting text
// no longer opens the composer directly (that hijacks normal select/copy);
// instead a floating button appears at these viewport coordinates and only
// opens the composer when clicked.
export interface PendingSelection {
  draft: RangeCommentDraft;
  top: number;
  left: number;
}

interface HoveredBlock {
  index: number;
  top: number;
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

export function useMarkdownInteractions(input: {
  bodyRef: RefObject<HTMLDivElement | null>;
  canComment: boolean;
}) {
  const [hoveredBlock, setHoveredBlock] = useState<HoveredBlock | null>(null);
  const [rangeCommentDraft, setRangeCommentDraft] =
    useState<RangeCommentDraft | null>(null);
  const [pendingSelection, setPendingSelection] =
    useState<PendingSelection | null>(null);

  const handleBodyMouseOver = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!input.canComment) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const block = target.closest("[data-block-index]");
      if (!(block instanceof HTMLElement)) {
        return;
      }
      const index = Number(block.getAttribute("data-block-index"));
      const top = block.offsetTop;
      setHoveredBlock((currentBlock) => {
        if (
          currentBlock &&
          currentBlock.index === index &&
          currentBlock.top === top
        ) {
          return currentBlock;
        }
        return { index, top };
      });
    },
    [input.canComment],
  );

  const handleBodyClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const footnoteLink = target.closest(
        "[data-footnote-ref], [data-footnote-backref]",
      );
      if (!(footnoteLink instanceof HTMLAnchorElement)) {
        return;
      }
      event.preventDefault();
      const hash = footnoteLink.getAttribute("href");
      if (!hash || !hash.startsWith("#")) {
        return;
      }
      document
        .getElementById(hash.slice(1))
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
    [],
  );

  // Selecting text no longer opens the composer directly — it surfaces a
  // floating "Comment" button, so the raw selection stays usable (copy/paste).
  const handleBodyMouseUp = useCallback(() => {
    if (!input.canComment) {
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setPendingSelection(null);
      return;
    }
    const draft = captureRangeCommentDraft(selection);
    if (!draft) {
      setPendingSelection(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setPendingSelection({
      draft,
      top: rect.top,
      left: rect.left + rect.width / 2,
    });
  }, [input.canComment]);

  const handleBodyMouseDown = useCallback(() => {
    setPendingSelection(null);
  }, []);

  const confirmPendingSelection = useCallback(() => {
    if (!pendingSelection) {
      return;
    }
    setRangeCommentDraft(pendingSelection.draft);
    setPendingSelection(null);
  }, [pendingSelection]);

  // A floating button anchored to viewport coords would drift on scroll, so
  // dismiss it instead.
  useEffect(() => {
    if (!pendingSelection) {
      return;
    }
    const clear = () => setPendingSelection(null);
    window.addEventListener("scroll", clear, true);
    return () => window.removeEventListener("scroll", clear, true);
  }, [pendingSelection]);

  const handleSpecialBlockAnchor = useCallback(
    (blockIndex: number, anchor: CommentAnchorDraft) => {
      const block = input.bodyRef.current?.querySelector<HTMLElement>(
        `[data-block-index="${blockIndex}"]`,
      );
      if (!block) {
        return;
      }
      setRangeCommentDraft({ blockIndex, top: block.offsetTop, anchor });
    },
    [input.bodyRef],
  );

  const dismissRangeComment = useCallback(() => {
    setRangeCommentDraft(null);
    setPendingSelection(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const handleBodyMouseLeave = useCallback(() => setHoveredBlock(null), []);

  return {
    confirmPendingSelection,
    dismissRangeComment,
    handleBodyClick,
    handleBodyMouseDown,
    handleBodyMouseLeave,
    handleBodyMouseOver,
    handleBodyMouseUp,
    handleSpecialBlockAnchor,
    hoveredBlock,
    pendingSelection,
    rangeCommentDraft,
  };
}
