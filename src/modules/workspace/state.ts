import type { StoreApi } from "zustand";
import { ensureRelaySubscriptions, unsubscribeFromDoc } from "../../services/relay";
import { findLiveFileInTree } from "../../types/fileTree";
import type { FileNode } from "../../types/fileTree";
import type { HistoryEntry } from "../../types/history";
import type { TabState } from "../../types/tab";
import { createDefaultTab } from "../../types/tab";
import {
  loadAndCleanShares,
  restoreShareKeys,
  stableShareKey,
} from "../sharing";
import {
  buildUpdatedActiveTabs,
  buildUpdatedTabs,
  getActiveTab,
  needsDirectoryTabRestore,
} from "./helpers";
import {
  cleanExpiredWorkspaceHistory,
  findTabByHandle,
  loadWorkspaceHistory,
  migrateHandleToHistory,
  restoreDirectoryTabState,
  saveWorkspaceHistory,
} from "./controller";
import {
  buildFileTree,
  getHandle,
  openDirectory,
  openFile,
  readFile,
  removeHandle,
  saveHandle,
} from "./storage";
import type {
  WorkspaceActions,
  WorkspaceControllerDeps,
  WorkspaceState,
} from "./types";

type SetState<StoreState> = StoreApi<StoreState>["setState"];
type GetState<StoreState> = StoreApi<StoreState>["getState"];

const HISTORY_LIMIT = 20;

interface WorkspaceActionStore extends WorkspaceState {}

interface WorkspaceActionDeps<StoreState extends WorkspaceActionStore>
  extends WorkspaceControllerDeps {
  set: SetState<StoreState>;
  get: GetState<StoreState>;
}

function createHistoryEntry(tab: TabState): HistoryEntry | null {
  const isDirectory = Boolean(tab.directoryName);
  const name = tab.directoryName ?? tab.fileName;
  if (!name) {
    return null;
  }

  const hasActiveShares = tab.shares.some(
    (share) => new Date(share.expiresAt) > new Date(),
  );

  return {
    id: crypto.randomUUID(),
    type: isDirectory ? "directory" : "file",
    name,
    stableKey: stableShareKey(tab),
    closedAt: new Date().toISOString(),
    activeFilePath: tab.activeFilePath,
    hasActiveShares,
  };
}

function removeHistoryEntryFromState(
  history: HistoryEntry[],
  entryId: string,
): HistoryEntry[] {
  return history.filter((entry) => entry.id !== entryId);
}

export function createWorkspaceState(
  initialHistory: HistoryEntry[] = loadWorkspaceHistory(),
): WorkspaceState {
  return {
    tabs: [],
    activeTabId: null,
    history: initialHistory,
    historyDropdownOpen: false,
  };
}

export function createWorkspaceActions<StoreState extends WorkspaceActionStore>(
  deps: WorkspaceActionDeps<StoreState>,
): WorkspaceActions {
  const { get, set, scanAllFileComments, showToast, syncActiveShares } = deps;

  return {
    toggleHistoryDropdown: () => {
      set((state) => ({ historyDropdownOpen: !state.historyDropdownOpen }));
    },

    reopenFromHistory: async (entryId) => {
      const entry = get().history.find((historyEntry) => historyEntry.id === entryId);
      if (!entry) {
        return;
      }

      const handle = await getHandle(`history:${entryId}`);
      if (!handle) {
        const updatedHistory = removeHistoryEntryFromState(get().history, entryId);
        saveWorkspaceHistory(updatedHistory);
        set({ history: updatedHistory });
        showToast("File access expired — please reopen manually");
        return;
      }

      let writeAllowed = false;
      try {
        const writePermission = await handle.requestPermission({
          mode: "readwrite",
        });
        writeAllowed = writePermission === "granted";
      } catch (error) {
        console.warn("[history] readwrite permission request failed:", error);
      }

      if (!writeAllowed) {
        try {
          const readPermission = await handle.requestPermission({ mode: "read" });
          if (readPermission !== "granted") {
            showToast("Permission denied");
            return;
          }
        } catch (error) {
          console.warn("[history] read permission request failed:", error);
          showToast("Permission denied");
          return;
        }
      }

      if (entry.type === "directory") {
        if (handle.kind !== "directory") {
          showToast("Saved folder access is invalid — please reopen manually");
          return;
        }

        const tab = createDefaultTab({
          label: entry.name,
          directoryHandle: handle,
          directoryName: entry.name,
          sidebarOpen: true,
          writeAllowed,
        });
        set((state) => ({
          tabs: [...state.tabs, tab],
          activeTabId: tab.id,
        }));

        await saveHandle(`tab:${tab.id}:directory`, handle);
        const tree = await buildFileTree(handle);
        set((state) => ({
          tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({
            fileTree: tree,
          })),
        }));

        if (entry.activeFilePath) {
          const fileNode = findLiveFileInTree(tree, entry.activeFilePath);
          if (fileNode) {
            const rawContent = await readFile(fileNode.handle);
            set((state) => ({
              tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({
                fileHandle: fileNode.handle,
                fileName: fileNode.name,
                rawContent,
                activeFilePath: fileNode.path,
              })),
            }));
          }
        }

        if (get().activeTabId === tab.id) {
          await scanAllFileComments();
        }
      } else {
        if (handle.kind !== "file") {
          showToast("Saved file access is invalid — please reopen manually");
          return;
        }

        const rawContent = await readFile(handle);
        const tab = createDefaultTab({
          label: entry.name,
          fileHandle: handle,
          fileName: entry.name,
          rawContent,
          writeAllowed,
        });
        set((state) => ({
          tabs: [...state.tabs, tab],
          activeTabId: tab.id,
        }));
        await saveHandle(`tab:${tab.id}:file`, handle);
      }

      const updatedHistory = removeHistoryEntryFromState(get().history, entryId);
      saveWorkspaceHistory(updatedHistory);
      set({ history: updatedHistory, historyDropdownOpen: false });
      removeHandle(`history:${entryId}`).catch((error) =>
        console.warn("[history] failed to remove handle:", error),
      );

      const allShares = loadAndCleanShares(get().tabs);
      const currentTab = getActiveTab(get());
      if (!currentTab) {
        return;
      }

      const tabShares = allShares[stableShareKey(currentTab)] ?? [];
      if (tabShares.length === 0) {
        return;
      }

      const restoredKeys = await restoreShareKeys(tabShares);
      set((state) => ({
        tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, (tabState) => ({
          shares: tabShares,
          shareKeys: { ...tabState.shareKeys, ...restoredKeys },
        })),
      }));
    },

    removeHistoryEntry: (entryId) => {
      const updatedHistory = removeHistoryEntryFromState(get().history, entryId);
      saveWorkspaceHistory(updatedHistory);
      set({ history: updatedHistory });
      removeHandle(`history:${entryId}`).catch((error) =>
        console.warn("[history] failed to remove handle:", error),
      );
    },

    clearHistory: () => {
      const entries = get().history;
      for (const entry of entries) {
        removeHandle(`history:${entry.id}`).catch((error) =>
          console.warn("[history] failed to remove handle:", error),
        );
      }
      saveWorkspaceHistory([]);
      set({ history: [], historyDropdownOpen: false });
    },

    addTab: (tab) => {
      set((state) => ({
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
      }));
    },

    removeTab: (tabId) => {
      const { activeTabId, tabs } = get();
      const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex === -1) {
        return;
      }

      const tab = tabs[tabIndex];
      const updatedTabs = tabs.filter((currentTab) => currentTab.id !== tabId);
      const docIdsToUnsubscribe = tab.shares
        .map((share) => share.docId)
        .filter(
          (docId) =>
            !updatedTabs.some((currentTab) =>
              currentTab.shares.some((share) => share.docId === docId),
            ),
        );

      let nextActiveTabId: string | null = null;
      if (updatedTabs.length > 0) {
        if (activeTabId === tabId) {
          const nextTabIndex = Math.min(tabIndex, updatedTabs.length - 1);
          nextActiveTabId = updatedTabs[nextTabIndex].id;
        } else {
          nextActiveTabId = activeTabId;
        }
      }

      const historyEntry = createHistoryEntry(tab);
      if (historyEntry) {
        const nextHistory = [
          historyEntry,
          ...get().history.filter(
            (entry) => entry.stableKey !== historyEntry.stableKey,
          ),
        ].slice(0, HISTORY_LIMIT);

        const handleKey =
          historyEntry.type === "directory"
            ? `tab:${tabId}:directory`
            : `tab:${tabId}:file`;

        void migrateHandleToHistory(handleKey, historyEntry.id, nextHistory, get).catch(
          (error) => console.warn("[history] handle migration failed:", error),
        );

        saveWorkspaceHistory(nextHistory);
        set({
          tabs: updatedTabs,
          activeTabId: nextActiveTabId,
          history: nextHistory,
        });
      } else {
        removeHandle(`tab:${tabId}:directory`).catch((error) =>
          console.warn("[handleStore] cleanup failed:", error),
        );
        removeHandle(`tab:${tabId}:file`).catch((error) =>
          console.warn("[handleStore] cleanup failed:", error),
        );
        set({ tabs: updatedTabs, activeTabId: nextActiveTabId });
      }

      for (const docId of docIdsToUnsubscribe) {
        unsubscribeFromDoc(docId);
      }
    },

    switchTab: async (tabId) => {
      set({ activeTabId: tabId });
      const tab = get().tabs.find((currentTab) => currentTab.id === tabId);
      if (!tab?.directoryName || !needsDirectoryTabRestore(tab)) {
        return;
      }

      await restoreDirectoryTabState(get, set, tabId, scanAllFileComments);
    },

    openFileInNewTab: async () => {
      const result = await openFile();
      if (!result) {
        return;
      }

      const existingTab = await findTabByHandle(get().tabs, result.handle, "file");
      if (existingTab) {
        set({ activeTabId: existingTab.id });
        return;
      }

      const rawContent = await readFile(result.handle);
      const tab = createDefaultTab({
        label: result.name,
        fileHandle: result.handle,
        fileName: result.name,
        rawContent,
      });

      set((state) => ({
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
      }));
      await saveHandle(`tab:${tab.id}:file`, result.handle);
    },

    openDirectoryInNewTab: async () => {
      const result = await openDirectory();
      if (!result) {
        return;
      }

      const existingTab = await findTabByHandle(
        get().tabs,
        result.handle,
        "directory",
      );
      if (existingTab) {
        set({ activeTabId: existingTab.id });
        return;
      }

      const tab = createDefaultTab({
        label: result.name,
        directoryHandle: result.handle,
        directoryName: result.name,
        sidebarOpen: true,
      });

      set((state) => ({
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
      }));

      await saveHandle(`tab:${tab.id}:directory`, result.handle);
      const tree = await buildFileTree(result.handle);
      set((state) => ({
        tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({
          fileTree: tree,
        })),
      }));

      if (get().activeTabId === tab.id) {
        await scanAllFileComments();
      }
    },

    reopenTab: async (tabId) => {
      const tab = get().tabs.find((currentTab) => currentTab.id === tabId);
      if (!tab) {
        return;
      }

      if (tab.directoryName) {
        try {
          const result = await openDirectory();
          if (!result) {
            return;
          }

          await saveHandle(`tab:${tabId}:directory`, result.handle);
          const tree = await buildFileTree(result.handle);
          set((state) => ({
            tabs: buildUpdatedTabs(state.tabs, tabId, () => ({
              directoryHandle: result.handle,
              directoryName: result.name,
              label: result.name,
              fileTree: tree,
              fileHandle: null,
              fileName: null,
              rawContent: "",
              activeFilePath: null,
              restoreError: null,
            })),
          }));

          if (get().activeTabId === tabId && tree.length > 0) {
            await scanAllFileComments();
          }
        } catch (error) {
          console.error(
            "[reopenTab] failed to reopen directory tab:",
            tabId,
            error,
          );
          set((state) => ({
            tabs: buildUpdatedTabs(state.tabs, tabId, () => ({
              restoreError: `The folder "${tab.directoryName}" could not be opened. Please try again.`,
            })),
          }));
        }
      } else {
        try {
          const result = await openFile();
          if (!result) {
            return;
          }

          await saveHandle(`tab:${tabId}:file`, result.handle);
          const rawContent = await readFile(result.handle);
          set((state) => ({
            tabs: buildUpdatedTabs(state.tabs, tabId, () => ({
              fileHandle: result.handle,
              fileName: result.name,
              label: result.name,
              rawContent,
              restoreError: null,
            })),
          }));
        } catch (error) {
          console.error("[reopenTab] failed to reopen file tab:", tabId, error);
          set((state) => ({
            tabs: buildUpdatedTabs(state.tabs, tabId, () => ({
              restoreError: `The file "${tab.fileName}" could not be opened. Please try again.`,
            })),
          }));
        }
      }
    },

    selectFile: async (node: FileNode) => {
      const rawContent = await readFile(node.handle);
      set((state) => ({
        tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
          fileHandle: node.handle,
          fileName: node.name,
          rawContent,
          activeFilePath: node.path,
          resolvedComments: [],
        })),
      }));
    },

    clearFile: () => {
      set((state) => ({
        tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
          fileHandle: null,
          fileName: null,
          rawContent: "",
          directoryHandle: null,
          directoryName: null,
          fileTree: [],
          activeFilePath: null,
        })),
      }));
    },

    toggleSidebar: () => {
      set((state) => ({
        tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, (tab) => ({
          sidebarOpen: !tab.sidebarOpen,
        })),
      }));
    },

    refreshFile: async () => {
      const tab = getActiveTab(get());
      if (!tab?.fileHandle) {
        return;
      }

      try {
        const newRawContent = await readFile(tab.fileHandle);
        const changed = newRawContent !== tab.rawContent;
        const newlyResolvedComments = tab.comments.filter(
          (comment) => !newRawContent.includes(comment.raw),
        );
        set((state) => ({
          tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
            rawContent: newRawContent,
            resolvedComments: newlyResolvedComments,
          })),
        }));
        if (changed) {
          syncActiveShares();
        }
      } catch (error) {
        console.error("[refreshFile] file read failed:", error);
      }
    },

    refreshFileTree: async () => {
      const tab = getActiveTab(get());
      if (!tab?.directoryHandle) {
        return;
      }

      const tabId = tab.id;
      try {
        const tree = await buildFileTree(tab.directoryHandle);
        set((state) => ({
          tabs: buildUpdatedTabs(state.tabs, tabId, () => ({
            fileTree: tree,
          })),
        }));
        await scanAllFileComments();
      } catch (error) {
        console.error("[refreshFileTree] directory read failed:", error);
      }
    },

    restoreTabs: async () => {
      const cleanedHistory = cleanExpiredWorkspaceHistory();
      set({ history: cleanedHistory });

      const { tabs } = get();
      for (const tab of tabs) {
        if (tab.directoryName) {
          try {
            await restoreDirectoryTabState(get, set, tab.id, scanAllFileComments);
          } catch (error) {
            console.error(
              "[restoreTabs] failed to restore directory tab:",
              tab.id,
              error,
            );
          }
        } else if (tab.fileName) {
          try {
            const handle = await getHandle(`tab:${tab.id}:file`);
            if (!handle || handle.kind !== "file") {
              console.warn(
                "[restoreTabs] no handle in IndexedDB for file tab:",
                tab.id,
                tab.fileName,
              );
              set((state) => ({
                tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({
                  restoreError: `The file "${tab.fileName}" could not be accessed. It may have been moved, renamed, or deleted.`,
                })),
              }));
              continue;
            }

            let writePermission = await handle.queryPermission({
              mode: "readwrite",
            });
            if (writePermission !== "granted") {
              writePermission = await handle.requestPermission({
                mode: "readwrite",
              });
            }
            console.log("[restoreTabs] file tab permissions", {
              tabId: tab.id,
              fileName: tab.fileName,
              writePermission,
            });
            if (writePermission !== "granted") {
              console.warn(
                "[restoreTabs] skipping file tab — readwrite not granted:",
                tab.id,
                tab.fileName,
              );
              set((state) => ({
                tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({
                  restoreError: `The file "${tab.fileName}" requires permission to access. Please reopen it.`,
                })),
              }));
              continue;
            }

            let restoredRawContent: string | null = null;
            try {
              restoredRawContent = await readFile(handle);
            } catch (error) {
              console.warn(
                "[restoreTabs] file read failed, keeping persisted content:",
                error,
              );
            }

            set((state) => ({
              tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({
                fileHandle: handle,
                restoreError: null,
                ...(restoredRawContent !== null
                  ? { rawContent: restoredRawContent }
                  : {}),
              })),
            }));
            console.log(
              "[restoreTabs] file tab restored successfully:",
              tab.id,
              tab.fileName,
            );
          } catch (error) {
            console.error(
              "[restoreTabs] failed to restore file tab:",
              tab.id,
              error,
            );
            set((state) => ({
              tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({
                restoreError: `The file "${tab.fileName}" could not be accessed. It may have been moved, renamed, or deleted.`,
              })),
            }));
          }
        }
      }

      const allShares = loadAndCleanShares(get().tabs);
      for (const tab of get().tabs) {
        const tabShares = allShares[stableShareKey(tab)] ?? [];
        if (tabShares.length === 0) {
          continue;
        }

        const restoredKeys = await restoreShareKeys(tabShares);
        set((state) => ({
          tabs: buildUpdatedTabs(state.tabs, tab.id, (tabState) => ({
            shares: tabShares,
            shareKeys: { ...tabState.shareKeys, ...restoredKeys },
          })),
        }));
      }

      const activeShares = get().tabs.flatMap((tab) => tab.shares);
      ensureRelaySubscriptions(activeShares);
    },
  };
}
