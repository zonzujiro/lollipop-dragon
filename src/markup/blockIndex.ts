import type { Comment } from "../types/criticmarkup";
import {
  findQuoteOccurrences,
  getBlockPlainTextMap,
  getPlainText,
  getRenderedBlocks,
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

// Parse cleanMarkdown and return the offset range of each RENDERED top-level
// block. Footnote definitions collapse into one trailing rendered section, so
// every definition shares the single index after the last rendered block.
export function getBlockPositions(cleanMarkdown: string): BlockPosition[] {
  const { nodes, footnoteDefinitions } = getRenderedBlocks(cleanMarkdown);
  const positions: BlockPosition[] = nodes.map((node, index) => ({
    index,
    start: node.position?.start.offset ?? 0,
    end: node.position?.end.offset ?? 0,
  }));
  for (const definition of footnoteDefinitions) {
    positions.push({
      index: nodes.length,
      start: definition.position?.start.offset ?? 0,
      end: definition.position?.end.offset ?? 0,
    });
  }
  return positions;
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
    const containingPosition = positions.find(
      ({ start, end }) => cleanStart >= start && cleanStart <= end,
    );
    let blockIndex = standaloneAnchorBlockIndex ?? containingPosition?.index;
    // Fallback: position is past every block (e.g. trailing comment)
    if (blockIndex === undefined || blockIndex === -1) {
      blockIndex = positions.reduce(
        (nearest, position) => Math.max(nearest, position.index),
        0,
      );
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
