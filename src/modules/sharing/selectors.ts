import type { PeerComment } from "../../types/share";
import type { SharingTabState } from "./types";

export function selectHasActiveShares<TabState extends Pick<SharingTabState, "shares">>(
  tab: TabState,
): boolean {
  return tab.shares.some((share) => new Date(share.expiresAt) > new Date());
}

export function selectTotalPendingCommentCount<
  TabState extends Pick<SharingTabState, "shares">,
>(tab: TabState): number {
  return tab.shares.reduce(
    (total, share) => total + share.pendingCommentCount,
    0,
  );
}

export function selectPendingCommentsForDoc<
  TabState extends Pick<SharingTabState, "pendingComments">,
>(tab: TabState, docId: string): PeerComment[] {
  return tab.pendingComments[docId] ?? [];
}
