import type { StoreApi } from "zustand";
import type { Comment } from "../../types/criticmarkup";
import type { TabState } from "../../types/tab";
import type {
  FileCommentEntry,
  HostCommentFilter,
  HostReviewActions,
} from "./types";

type SetState<StoreState> = StoreApi<StoreState>["setState"];
type GetState<StoreState> = StoreApi<StoreState>["getState"];

interface HostReviewStoreState {
  tabs: TabState[];
  activeTabId: string | null;
  isPeerMode: boolean;
  peerCommentPanelOpen: boolean;
}

interface HostReviewActionDeps<StoreState extends HostReviewStoreState> {
  set: SetState<StoreState>;
  get: GetState<StoreState>;
  getActiveTab: (get: () => StoreState) => TabState | null;
  buildUpdatedActiveTabs: (
    tabs: TabState[],
    activeTabId: string | null,
    updater: (tab: TabState) => Partial<TabState>,
  ) => TabState[];
}

function buildFileCommentEntries(
  tab: TabState,
  comments: Comment[],
): Record<string, FileCommentEntry> {
  const activePath = tab.activeFilePath ?? tab.fileName;
  if (!activePath) {
    return tab.allFileComments;
  }

  return {
    ...tab.allFileComments,
    [activePath]: {
      filePath: activePath,
      fileName: activePath.split("/").pop() ?? activePath,
      comments: comments.map((comment) => ({
        ...comment,
        filePath: activePath,
      })),
    },
  };
}

export function createHostReviewActions<StoreState extends HostReviewStoreState>(
  deps: HostReviewActionDeps<StoreState>,
): Pick<
  HostReviewActions,
  | "setComments"
  | "setActiveCommentId"
  | "toggleCommentPanel"
  | "setCommentFilter"
  | "clearUndo"
  | "clearPendingScrollTarget"
> {
  const { set, get, getActiveTab, buildUpdatedActiveTabs } = deps;

  return {
    setComments: (comments) => {
      const tab = getActiveTab(get);
      if (!tab) {
        return;
      }

      set((state) => ({
        tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
          comments,
          activeCommentId: null,
          commentFilter: "all",
          allFileComments: buildFileCommentEntries(tab, comments),
        })),
      }));
    },

    setActiveCommentId: (id) => {
      set((state) => ({
        tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
          activeCommentId: id,
        })),
      }));
    },

    toggleCommentPanel: () => {
      if (get().isPeerMode) {
        set((state) => ({
          peerCommentPanelOpen: !state.peerCommentPanelOpen,
        }));
        return;
      }

      set((state) => ({
        tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, (tab) => ({
          commentPanelOpen: !tab.commentPanelOpen,
          sharedPanelOpen: !tab.commentPanelOpen ? false : tab.sharedPanelOpen,
        })),
      }));
    },

    setCommentFilter: (filter: HostCommentFilter) => {
      set((state) => ({
        tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
          commentFilter: filter,
          activeCommentId: null,
        })),
      }));
    },

    clearUndo: () => {
      set((state) => ({
        tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
          undoState: null,
        })),
      }));
    },

    clearPendingScrollTarget: () => {
      set((state) => ({
        tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
          pendingScrollTarget: null,
        })),
      }));
    },
  };
}
