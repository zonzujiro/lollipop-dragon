import { useAppStore } from "./index";
import type { TabState } from "../types/tab";
import type { PeerComment } from "../types/share";

export function getActiveTab(state: {
  tabs: TabState[];
  activeTabId: string | null;
}): TabState | null {
  if (!state.activeTabId) {
    return null;
  }
  return state.tabs.find((t) => t.id === state.activeTabId) ?? null;
}

export function useActiveTab(): TabState | null {
  return useAppStore((s) => getActiveTab(s));
}

export function useActiveTabField<K extends keyof TabState>(
  field: K,
): TabState[K] | undefined {
  return useAppStore((s) => {
    const tab = getActiveTab(s);
    return tab?.[field];
  });
}

/** Unsubmitted peer comments across the shared document. */
export function getUnsubmittedPeerComments(state: {
  myPeerComments: PeerComment[];
  submittedPeerCommentIds: string[];
}): PeerComment[] {
  return state.myPeerComments.filter(
    (comment) => !state.submittedPeerCommentIds.includes(comment.id),
  );
}
