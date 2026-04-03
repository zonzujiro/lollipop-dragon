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

/** Unsubmitted peer comments for the currently viewed file. */
export function getUnsubmittedPeerComments(state: {
  myPeerComments: PeerComment[];
  submittedPeerCommentIds: string[];
  peerActiveFilePath: string | null;
}): PeerComment[] {
  return state.myPeerComments.filter(
    (c) =>
      c.path === state.peerActiveFilePath &&
      !state.submittedPeerCommentIds.includes(c.id),
  );
}

/** All peer comments visible to the current user (own + remote). */
export function getAllVisiblePeerComments(state: {
  myPeerComments: PeerComment[];
  remotePeerComments: PeerComment[];
}): PeerComment[] {
  return [...state.myPeerComments, ...state.remotePeerComments];
}
