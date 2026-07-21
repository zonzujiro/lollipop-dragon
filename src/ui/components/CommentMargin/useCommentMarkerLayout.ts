import { useMemo } from "react";
import type { PeerComment } from "../../../types/share";
import type { DotGroup } from "./CommentMarkers";
import {
  findAvailableMarkerSlot,
  layoutMarkerStacks,
  MARKER_STACK_STEP,
} from "./commentMarkerLayout";

interface CommentMarkerLayoutOptions {
  blockTops: ReadonlyMap<number, number>;
  groups: readonly DotGroup[];
  hoveredBlock: { index: number; top: number } | null;
  peerDotGroups: ReadonlyMap<number, readonly PeerComment[]>;
}

export function useCommentMarkerLayout({
  blockTops,
  groups,
  hoveredBlock,
  peerDotGroups,
}: CommentMarkerLayoutOptions) {
  const markerCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const group of groups) {
      const blockIndex = group.threads[0]?.root.blockIndex;
      if (blockIndex !== undefined) {
        counts.set(blockIndex, group.threads.length);
      }
    }
    for (const [blockIndex, peerComments] of peerDotGroups) {
      counts.set(
        blockIndex,
        (counts.get(blockIndex) ?? 0) + peerComments.length,
      );
    }
    return counts;
  }, [groups, peerDotGroups]);
  const markerPlacements = useMemo(
    () =>
      layoutMarkerStacks(
        Array.from(markerCounts.entries()).flatMap(
          ([blockIndex, markerCount]) => {
            const preferredTop = blockTops.get(blockIndex);
            return preferredTop === undefined
              ? []
              : [{ blockIndex, markerCount, preferredTop }];
          },
        ),
      ),
    [blockTops, markerCounts],
  );
  const markerTops = useMemo(() => {
    const tops = new Map<number, number>();
    for (const placement of markerPlacements) {
      tops.set(placement.blockIndex, placement.top);
    }
    return tops;
  }, [markerPlacements]);
  const hoveredBlockAddTop = hoveredBlock
    ? findAvailableMarkerSlot(
        (markerTops.get(hoveredBlock.index) ?? hoveredBlock.top) +
          (markerCounts.get(hoveredBlock.index) ?? 0) * MARKER_STACK_STEP,
        markerPlacements,
      )
    : 0;

  return { hoveredBlockAddTop, markerTops };
}
