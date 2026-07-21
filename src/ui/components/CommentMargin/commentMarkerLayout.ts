export const MARKER_STACK_STEP = 30;

export interface MarkerStack {
  blockIndex: number;
  markerCount: number;
  preferredTop: number;
}

export interface MarkerPlacement extends MarkerStack {
  top: number;
}

export function layoutMarkerStacks(
  stacks: readonly MarkerStack[],
): MarkerPlacement[] {
  const orderedStacks = [...stacks].sort(
    (leftStack, rightStack) =>
      leftStack.preferredTop - rightStack.preferredTop ||
      leftStack.blockIndex - rightStack.blockIndex,
  );
  const placements: MarkerPlacement[] = [];
  let nextAvailableTop = Number.NEGATIVE_INFINITY;

  for (const stack of orderedStacks) {
    if (stack.markerCount <= 0) {
      continue;
    }
    const top = Math.max(stack.preferredTop, nextAvailableTop);
    placements.push({ ...stack, top });
    nextAvailableTop = top + stack.markerCount * MARKER_STACK_STEP;
  }

  return placements;
}

export function findAvailableMarkerSlot(
  preferredTop: number,
  placements: readonly MarkerPlacement[],
): number {
  let availableTop = preferredTop;

  for (const placement of placements) {
    const placementBottom =
      placement.top + placement.markerCount * MARKER_STACK_STEP;
    const availableBottom = availableTop + MARKER_STACK_STEP;
    const slotIsBeforePlacement = availableBottom <= placement.top;
    const slotIsAfterPlacement = availableTop >= placementBottom;
    if (slotIsBeforePlacement || slotIsAfterPlacement) {
      continue;
    }
    availableTop = placementBottom;
  }

  return availableTop;
}
