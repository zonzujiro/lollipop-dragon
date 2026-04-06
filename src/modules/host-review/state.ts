import type { StoreApi } from "zustand";
import { parseCriticMarkup } from "../../markup";
import { applyDelete } from "../../markup";
import { applyEdit } from "../../markup";
import { writeFile } from "../../services/fileSystem";
import { insertComment as insertCommentService } from "../../markup";
import type { Comment } from "../../types/criticmarkup";
import type { FileNode, FileTreeNode } from "../../types/fileTree";
import { findLiveFileInTree } from "../../types/fileTree";
import type { TabState } from "../../types/tab";
import {
  isPermissionError,
  scanAllTabFileComments,
  scrollToHostReviewBlock,
  writeAndUpdate,
} from "./controller";
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
  selectFile: (node: FileNode) => Promise<void>;
}

interface HostReviewActionDeps<StoreState extends HostReviewStoreState> {
  set: SetState<StoreState>;
  get: GetState<StoreState>;
  getActiveTab: (get: () => StoreState) => TabState | null;
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
  getLiveFileTree: (tab: TabState) => FileTreeNode[];
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
): HostReviewActions {
  const {
    set,
    get,
    getActiveTab,
    buildUpdatedTabs,
    buildUpdatedActiveTabs,
    getLiveFileTree,
  } = deps;

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

    scanAllFileComments: async () => {
      const tab = getActiveTab(get);
      if (!tab) {
        return;
      }

      const tabId = tab.id;
      const scannedComments = await scanAllTabFileComments(tab, getLiveFileTree);
      const currentTab = get().tabs.find((currentTab) => currentTab.id === tabId);
      if (!currentTab) {
        return;
      }

      const activePath = currentTab.activeFilePath ?? currentTab.fileName;
      const mergedComments = { ...scannedComments };
      if (activePath && currentTab.allFileComments[activePath]) {
        mergedComments[activePath] = currentTab.allFileComments[activePath];
      }

      set((state) => ({
        tabs: buildUpdatedTabs(state.tabs, tabId, () => ({
          allFileComments: mergedComments,
        })),
      }));
    },

    navigateToComment: (filePath, rawStart) => {
      const tab = getActiveTab(get);
      if (!tab) {
        return;
      }

      if (filePath === tab.activeFilePath) {
        const comment = tab.comments.find(
          (candidateComment) => candidateComment.rawStart === rawStart,
        );
        if (comment) {
          set((state) => ({
            tabs: buildUpdatedActiveTabs(
              state.tabs,
              state.activeTabId,
              () => ({
                activeCommentId: comment.id,
              }),
            ),
          }));
          scrollToHostReviewBlock(comment.blockIndex);
        }
        return;
      }

      const fileNode = findLiveFileInTree(tab.fileTree, filePath);
      if (fileNode) {
        set((state) => ({
          tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
            pendingScrollTarget: { filePath, rawStart },
          })),
        }));
        void get().selectFile(fileNode);
      }
    },

    navigateToBlock: (filePath, blockIndex) => {
      const tab = getActiveTab(get);
      if (!tab) {
        return;
      }

      if (filePath === tab.activeFilePath) {
        scrollToHostReviewBlock(blockIndex);
        return;
      }

      const fileNode = findLiveFileInTree(tab.fileTree, filePath);
      if (fileNode) {
        set((state) => ({
          tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
            pendingScrollTarget: { filePath, blockIndex },
          })),
        }));
        void get().selectFile(fileNode);
      }
    },

    clearPendingScrollTarget: () => {
      set((state) => ({
        tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
          pendingScrollTarget: null,
        })),
      }));
    },

    deleteComment: async (id) => {
      const tab = getActiveTab(get);
      if (!tab?.fileHandle) {
        return;
      }

      const comment = tab.comments.find(
        (candidateComment) => candidateComment.id === id,
      );
      if (!comment) {
        return;
      }

      await writeAndUpdate(
        get,
        set,
        buildUpdatedActiveTabs,
        tab.fileHandle,
        applyDelete(tab.rawContent, comment),
      );
    },

    deleteAllComments: async () => {
      const tab = getActiveTab(get);
      if (!tab?.fileHandle || tab.comments.length === 0) {
        return;
      }

      const sortedComments = [...tab.comments].sort(
        (leftComment, rightComment) =>
          rightComment.rawStart - leftComment.rawStart,
      );
      let nextRawContent = tab.rawContent;
      for (const comment of sortedComments) {
        nextRawContent = applyDelete(nextRawContent, comment);
      }

      await writeAndUpdate(
        get,
        set,
        buildUpdatedActiveTabs,
        tab.fileHandle,
        nextRawContent,
      );
    },

    editComment: async (id, type, text) => {
      const tab = getActiveTab(get);
      if (!tab?.fileHandle) {
        return;
      }

      const comment = tab.comments.find(
        (candidateComment) => candidateComment.id === id,
      );
      if (!comment) {
        return;
      }

      await writeAndUpdate(
        get,
        set,
        buildUpdatedActiveTabs,
        tab.fileHandle,
        applyEdit(tab.rawContent, comment, type, text),
      );
    },

    addComment: async (blockIndex, type, text) => {
      const tab = getActiveTab(get);
      if (!tab?.fileHandle) {
        return;
      }

      const { cleanMarkdown } = parseCriticMarkup(tab.rawContent);
      const nextRawContent = insertCommentService(
        tab.rawContent,
        tab.comments,
        cleanMarkdown,
        blockIndex,
        type,
        text,
      );

      await writeAndUpdate(
        get,
        set,
        buildUpdatedActiveTabs,
        tab.fileHandle,
        nextRawContent,
      );
    },

    undo: async () => {
      const tab = getActiveTab(get);
      if (!tab?.undoState || !tab.fileHandle) {
        return;
      }

      try {
        const restoredRawContent = tab.undoState.rawContent;
        await writeFile(tab.fileHandle, restoredRawContent);
        set((state) => ({
          tabs: buildUpdatedActiveTabs(
            state.tabs,
            state.activeTabId,
            () => ({
              rawContent: restoredRawContent,
              undoState: null,
              writeAllowed: true,
            }),
          ),
        }));
      } catch (error) {
        if (isPermissionError(error)) {
          set((state) => ({
            tabs: buildUpdatedActiveTabs(
              state.tabs,
              state.activeTabId,
              () => ({
                writeAllowed: false,
              }),
            ),
          }));
        } else {
          console.error("[undo] write failed:", error);
        }
      }
    },

    clearUndo: () => {
      set((state) => ({
        tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
          undoState: null,
        })),
      }));
    },
  };
}
