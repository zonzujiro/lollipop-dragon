import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root } from "mdast";
import type { Comment } from "../types/criticmarkup";
import {
  findQuoteOccurrences,
  getBlockPlainTextMap,
  getPlainText,
  resolveCommentAnchor,
} from "./commentAnchor";

export interface BlockPosition {
  index: number;
  start: number; // inclusive offset in cleanMarkdown
  end: number; // exclusive offset in cleanMarkdown
}

function findStandaloneAnchorBlockIndex(
  comment: Comment,
  positions: BlockPosition[],
  cleanMarkdown: string,
): number | null {
  if (!comment.anchor || comment.criticType !== "comment") {
    return null;
  }
  const matchingPositions = positions.filter((position) => {
    const blockMap = getBlockPlainTextMap(cleanMarkdown, position.index);
    if (!blockMap) {
      return false;
    }
    return !resolveCommentAnchor(blockMap.plainText, comment.anchor).orphaned;
  });
  if (matchingPositions.length === 0) {
    return null;
  }
  const precedingPositions = matchingPositions.filter(
    (position) => position.start <= comment.cleanStart,
  );
  const nearestPreceding =
    precedingPositions[precedingPositions.length - 1] ?? matchingPositions[0];
  return nearestPreceding.index;
}

// Parse cleanMarkdown and return the offset range of each top-level block.
export function getBlockPositions(cleanMarkdown: string): BlockPosition[] {
  const tree: Root = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(cleanMarkdown);
  return tree.children.map((node, index) => ({
    index,
    start: node.position?.start.offset ?? 0,
    end: node.position?.end.offset ?? 0,
  }));
}

// Assign a blockIndex to each comment based on where its cleanStart falls.
export function assignBlockIndices(
  comments: Comment[],
  cleanMarkdown: string,
): Comment[] {
  if (comments.length === 0) {
    return comments;
  }
  const positions = getBlockPositions(cleanMarkdown);
  if (positions.length === 0) {
    return comments;
  }

  return comments.map((comment) => {
    const { cleanStart } = comment;
    const standaloneAnchorBlockIndex = findStandaloneAnchorBlockIndex(
      comment,
      positions,
      cleanMarkdown,
    );
    let blockIndex =
      standaloneAnchorBlockIndex ??
      positions.findIndex(
        ({ start, end }) => cleanStart >= start && cleanStart <= end,
      );
    // Fallback: position is past the last block (e.g. trailing comment)
    if (blockIndex === -1) {
      blockIndex = positions.length - 1;
    }
    const blockMap = getBlockPlainTextMap(cleanMarkdown, blockIndex);
    if (!blockMap) {
      return { ...comment, blockIndex };
    }

    if (comment.criticType === "highlight" && comment.highlightedText) {
      const quote = getPlainText(comment.highlightedText);
      const occurrences = findQuoteOccurrences(blockMap.plainText, quote);
      const expectedStart = blockMap.characters.findIndex(
        ({ rawStart }) => rawStart >= comment.cleanStart,
      );
      const nearestStart = occurrences.reduce<number | undefined>(
        (nearest, occurrence) => {
          if (nearest === undefined) {
            return occurrence;
          }
          return Math.abs(occurrence - expectedStart) <
            Math.abs(nearest - expectedStart)
            ? occurrence
            : nearest;
        },
        undefined,
      );
      const occurrence =
        nearestStart === undefined ? 1 : occurrences.indexOf(nearestStart) + 1;
      const anchor = resolveCommentAnchor(blockMap.plainText, {
        quote,
        occurrence: Math.max(occurrence, 1),
      });
      return { ...comment, blockIndex, anchor };
    }

    if (comment.anchor) {
      const anchor = resolveCommentAnchor(blockMap.plainText, {
        quote: comment.anchor.quote,
        occurrence: comment.anchor.occurrence,
      });
      return { ...comment, blockIndex, anchor };
    }

    return { ...comment, blockIndex };
  });
}
