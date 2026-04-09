import type { StoreApi } from "zustand";
import type { PeerComment } from "../../types/share";
import type { TabState } from "../../types/tab";
import { tabRequiresRestoreAccess } from "../../types/tab";
import type { SharingActions, SharingTabState } from "./types";

type SetState<StoreState> = StoreApi<StoreState>["setState"];
type GetState<StoreState> = StoreApi<StoreState>["getState"];

export function removePendingCommentState(
  tab: TabState,
  docId: string,
  cmtId: string,
): Pick<SharingTabState, "pendingComments" | "shares"> {
  const nextPendingComments = { ...tab.pendingComments };
  const remainingComments = (nextPendingComments[docId] ?? []).filter(
    (comment) => comment.id !== cmtId,
  );
  if (remainingComments.length > 0) {
    nextPendingComments[docId] = remainingComments;
  } else {
    delete nextPendingComments[docId];
  }
  const nextShares = tab.shares.map((share) =>
    share.docId === docId
      ? { ...share, pendingCommentCount: remainingComments.length }
      : share,
  );
  return {
    pendingComments: nextPendingComments,
    shares: nextShares,
  };
}

export function replacePendingCommentsState(
  tab: TabState,
  docId: string,
  comments: PeerComment[],
): Pick<SharingTabState, "pendingComments" | "shares"> {
  const nextPendingComments = { ...tab.pendingComments };
  if (comments.length > 0) {
    nextPendingComments[docId] = comments;
  } else {
    delete nextPendingComments[docId];
  }
  const nextShares = tab.shares.map((share) =>
    share.docId === docId
      ? { ...share, pendingCommentCount: comments.length }
      : share,
  );
  return {
    pendingComments: nextPendingComments,
    shares: nextShares,
  };
}

export function mergeQueuedCommentIds(
  existingIds: string[],
  incomingIds: string[],
): string[] {
  const mergedIds = [...existingIds];
  for (const incomingId of incomingIds) {
    if (!mergedIds.includes(incomingId)) {
      mergedIds.push(incomingId);
    }
  }
  return mergedIds;
}

interface SharingStoreState {
  tabs: TabState[];
  activeTabId: string | null;
}

interface SharingActionDeps<StoreState extends SharingStoreState> {
  set: SetState<StoreState>;
  get: GetState<StoreState>;
  buildUpdatedTabs: (
    tabs: TabState[],
    tabId: string,
    updater: (tab: TabState) => Partial<TabState>,
  ) => TabState[];
  buildUpdatedActiveTabs: (
    tabs: TabState[],
    activeTabId: string | null,
    updater: (tab: TabState) => Partial<TabState>,
  ) => TabState[];
}

export function createSharingActions<StoreState extends SharingStoreState>(
  deps: SharingActionDeps<StoreState>,
): Pick<
  SharingActions,
  "toggleSharedPanel" | "queuePendingResolve" | "confirmPendingResolve"
> {
  const { set, get, buildUpdatedTabs, buildUpdatedActiveTabs } = deps;

  return {
    toggleSharedPanel: () => {
      const activeTab =
        get().tabs.find((tab) => tab.id === get().activeTabId) ?? null;
      if (tabRequiresRestoreAccess(activeTab)) {
        return;
      }

      set((state) => ({
        tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, (tab) => ({
          sharedPanelOpen: !tab.sharedPanelOpen,
          commentPanelOpen: !tab.sharedPanelOpen ? false : tab.commentPanelOpen,
        })),
      }));
    },

    queuePendingResolve: (docId, cmtId) => {
      const targetTab = get().tabs.find((tab) =>
        tab.shares.some((share) => share.docId === docId),
      );
      if (!targetTab) {
        return;
      }
      const existingIds = targetTab.pendingResolveCommentIds[docId] ?? [];
      const nextIds = mergeQueuedCommentIds(existingIds, [cmtId]);
      if (nextIds.length === existingIds.length) {
        return;
      }
      set((state) => ({
        tabs: buildUpdatedTabs(state.tabs, targetTab.id, (tabState) => ({
          pendingResolveCommentIds: {
            ...tabState.pendingResolveCommentIds,
            [docId]: nextIds,
          },
        })),
      }));
    },

    confirmPendingResolve: (docId, cmtId) => {
      const targetTab = get().tabs.find((tab) =>
        tab.shares.some((share) => share.docId === docId),
      );
      if (!targetTab) {
        return;
      }
      const existingIds = targetTab.pendingResolveCommentIds[docId] ?? [];
      if (!existingIds.includes(cmtId)) {
        return;
      }
      const remainingIds = existingIds.filter(
        (pendingId) => pendingId !== cmtId,
      );
      set((state) => ({
        tabs: buildUpdatedTabs(state.tabs, targetTab.id, (tabState) => {
          const nextPendingResolveIds = {
            ...tabState.pendingResolveCommentIds,
          };
          if (remainingIds.length > 0) {
            nextPendingResolveIds[docId] = remainingIds;
          } else {
            delete nextPendingResolveIds[docId];
          }
          return {
            pendingResolveCommentIds: nextPendingResolveIds,
          };
        }),
      }));
    },
  };
}
