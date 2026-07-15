import type { StoreApi } from "zustand";
import { findResolvedComments } from "../host-review";
import { ensureRelaySubscriptions, unsubscribeFromDoc } from "../relay";
import {
  loadAndCleanShares,
  restoreShareKeys,
  stableShareKey,
} from "../sharing";
import {
  findLiveFileInTree,
  isBrowserDirectoryHandle,
  isBrowserFileHandle,
  isNativeDirectoryTarget,
  isNativeFileTarget,
} from "../../types/fileTree";
import type {
  DirectoryTarget,
  FileNode,
  FileTarget,
} from "../../types/fileTree";
import type { HistoryEntry } from "../../types/history";
import type { ShareRecord } from "../../types/share";
import type { TabState } from "../../types/tab";
import { createDefaultTab } from "../../types/tab";
import {
  buildUpdatedActiveTabs,
  buildUpdatedTabs,
  getActiveTab,
  needsDirectoryTabRestore,
} from "./helpers";
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

const HISTORY_KEY = "markreview-history";
const HISTORY_LIMIT = 20;
const HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const BLOCKING_AGENT_RUN_STATUSES = new Set([
  "queued",
  "running",
  "needs_attention",
]);

interface AgentRunCloseGuardState {
  agentRuns: Record<string, { status: string }>;
  activeAgentRunIdByTabId: Record<string, string>;
}

async function saveBrowserHandle(
  key: string,
  handle: FileTarget | DirectoryTarget,
): Promise<void> {
  if (isBrowserFileHandle(handle) || isBrowserDirectoryHandle(handle)) {
    await saveHandle(key, handle);
  }
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    typeof value["id"] === "string" &&
    (value["type"] === "file" || value["type"] === "directory") &&
    typeof value["name"] === "string" &&
    typeof value["stableKey"] === "string" &&
    typeof value["closedAt"] === "string" &&
    (typeof value["activeFilePath"] === "string" ||
      value["activeFilePath"] === null) &&
    typeof value["hasActiveShares"] === "boolean"
  );
}

export function loadWorkspaceHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isHistoryEntry);
  } catch {
    return [];
  }
}

export function saveWorkspaceHistory(entries: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}

export async function migrateHandleToHistory<StoreState extends WorkspaceState>(
  handleKey: string,
  historyEntryId: string,
  nextHistory: HistoryEntry[],
  get: () => StoreState,
) {
  const handle = await getHandle(handleKey);
  if (handle) {
    await saveHandle(`history:${historyEntryId}`, handle);
  }
  await removeHandle(handleKey);

  const evictedEntries = get().history.filter(
    (entry) =>
      !nextHistory.some((historyEntry) => historyEntry.id === entry.id),
  );

  for (const evictedEntry of evictedEntries) {
    await removeHandle(`history:${evictedEntry.id}`).catch((error) =>
      console.warn("[history] failed to remove evicted handle:", error),
    );
  }
}

export function cleanExpiredWorkspaceHistory(): HistoryEntry[] {
  const entries = loadWorkspaceHistory();
  const cutoff = Date.now() - HISTORY_MAX_AGE_MS;
  const liveEntries = entries.filter(
    (entry) => new Date(entry.closedAt).getTime() > cutoff,
  );

  for (const entry of entries) {
    if (new Date(entry.closedAt).getTime() <= cutoff) {
      removeHandle(`history:${entry.id}`).catch((error) =>
        console.warn("[history] failed to remove expired handle:", error),
      );
    }
  }

  if (liveEntries.length !== entries.length) {
    saveWorkspaceHistory(liveEntries);
  }

  return liveEntries;
}

export async function restoreDirectoryTabState<
  StoreState extends WorkspaceState,
>(input: {
  get: () => StoreState;
  set: SetState<StoreState>;
  tabId: string;
  scanAllFileComments: () => Promise<void>;
  requestPermissionOnPrompt: boolean;
}): Promise<void> {
  const { get, set, tabId, scanAllFileComments, requestPermissionOnPrompt } =
    input;
  const tab = get().tabs.find((currentTab) => currentTab.id === tabId);
  if (!tab?.directoryName) {
    return;
  }

  try {
    const handle =
      tab.directoryHandle && isNativeDirectoryTarget(tab.directoryHandle)
        ? tab.directoryHandle
        : await getHandle(`tab:${tab.id}:directory`);
    if (
      !handle ||
      (!isBrowserDirectoryHandle(handle) && !isNativeDirectoryTarget(handle))
    ) {
      console.debug(
        "[restoreDirectoryTabState] no saved directory handle:",
        tab.id,
        tab.directoryName,
      );
      set((state) => ({
        tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({
          ...buildRestoreAccessState(
            buildFolderRestoreMessage({
              directoryName: tab.directoryName,
              fileName: tab.fileName,
            }),
          ),
        })),
      }));
      return;
    }

    if (isBrowserDirectoryHandle(handle)) {
      let readPermission = await handle.queryPermission({ mode: "read" });
      if (readPermission !== "granted" && requestPermissionOnPrompt) {
        readPermission = await handle.requestPermission({ mode: "read" });
      }
      if (readPermission !== "granted") {
        console.debug(
          "[restoreDirectoryTabState] directory permission not granted:",
          {
            tabId: tab.id,
            directoryName: tab.directoryName,
            readPermission,
          },
        );
        set((state) => ({
          tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({
            ...buildRestoreAccessState(
              buildFolderRestoreMessage({
                directoryName: tab.directoryName,
                fileName: tab.fileName,
              }),
            ),
          })),
        }));
        return;
      }
    }

    const tree = await buildFileTree(handle);
    const restoredFile = await restoreActiveFileFromTree({
      tree,
      activeFilePath: tab.activeFilePath,
      persistedFileName: tab.fileName,
      persistedRawContent: tab.rawContent,
    });

    set((state) => ({
      tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({
        directoryHandle: handle,
        directoryName: handle.name,
        fileTree: tree,
        fileHandle: restoredFile.fileHandle,
        fileName: restoredFile.fileName,
        rawContent: restoredFile.rawContent,
        writeAllowed: restoredFile.restoreMessage === null,
        commentPanelOpen: tab.commentPanelOpen,
        sharedPanelOpen: tab.sharedPanelOpen,
        restoreError: restoredFile.restoreMessage,
      })),
    }));

    if (
      get().activeTabId === tab.id &&
      tree.length > 0 &&
      restoredFile.restoreMessage === null
    ) {
      await scanAllFileComments();
    }
  } catch (error) {
    const directoryName = tab.directoryName ?? "unknown";
    console.error(
      "[restoreDirectoryTabState] failed to restore directory tab:",
      tabId,
      error,
    );
    set((state) => ({
      tabs: buildUpdatedTabs(state.tabs, tabId, () => ({
        directoryHandle: null,
        ...buildRestoreAccessState(
          buildFolderRestoreMessage({
            directoryName,
            fileName: tab.fileName,
          }),
        ),
      })),
    }));
  }
}

export async function findTabByHandle(
  tabs: TabState[],
  handle: FileTarget | DirectoryTarget,
  kind: "file" | "directory",
): Promise<TabState | null> {
  for (const tab of tabs) {
    const existingHandle =
      kind === "file" ? tab.fileHandle : tab.directoryHandle;
    if (!existingHandle) {
      continue;
    }

    if (
      isNativeFileTarget(existingHandle) &&
      isNativeFileTarget(handle) &&
      existingHandle.path === handle.path
    ) {
      return tab;
    }

    if (
      isNativeDirectoryTarget(existingHandle) &&
      isNativeDirectoryTarget(handle) &&
      existingHandle.path === handle.path
    ) {
      return tab;
    }

    if (
      isBrowserFileHandle(existingHandle) &&
      isBrowserFileHandle(handle) &&
      (await existingHandle.isSameEntry(handle))
    ) {
      return tab;
    }

    if (
      isBrowserDirectoryHandle(existingHandle) &&
      isBrowserDirectoryHandle(handle) &&
      (await existingHandle.isSameEntry(handle))
    ) {
      return tab;
    }
  }

  return null;
}

interface WorkspaceControllerActionDeps<
  StoreState extends WorkspaceState & AgentRunCloseGuardState,
> extends WorkspaceControllerDeps {
  set: SetState<StoreState>;
  get: GetState<StoreState>;
}

function hasBlockingAgentRunForTab(
  state: AgentRunCloseGuardState,
  tabId: string,
): boolean {
  const runId = state.activeAgentRunIdByTabId[tabId];
  const run = runId ? state.agentRuns[runId] : null;
  return Boolean(run && BLOCKING_AGENT_RUN_STATUSES.has(run.status));
}

function removeTabAgentRunState(
  state: AgentRunCloseGuardState,
  tabId: string,
): Partial<AgentRunCloseGuardState> {
  const runId = state.activeAgentRunIdByTabId[tabId];
  if (!runId) {
    return {};
  }

  const nextRuns = { ...state.agentRuns };
  delete nextRuns[runId];
  const nextActiveByTab = { ...state.activeAgentRunIdByTabId };
  delete nextActiveByTab[tabId];
  return {
    agentRuns: nextRuns,
    activeAgentRunIdByTabId: nextActiveByTab,
  };
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

function removeTabFromState(
  tabs: TabState[],
  activeTabId: string | null,
  tabId: string,
): { nextActiveTabId: string | null; updatedTabs: TabState[] } | null {
  const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
  if (tabIndex === -1) {
    return null;
  }

  const updatedTabs = tabs.filter((currentTab) => currentTab.id !== tabId);
  let nextActiveTabId: string | null = null;
  if (updatedTabs.length > 0) {
    if (activeTabId === tabId) {
      const nextTabIndex = Math.min(tabIndex, updatedTabs.length - 1);
      nextActiveTabId = updatedTabs[nextTabIndex].id;
    } else {
      nextActiveTabId = activeTabId;
    }
  }

  return { nextActiveTabId, updatedTabs };
}

function buildRestoreAccessState(message: string): Partial<TabState> {
  return {
    fileHandle: null,
    writeAllowed: false,
    restoreError: message,
  };
}

async function requestBrowserWritePermission(
  handle: FileSystemHandle,
): Promise<boolean> {
  const writePermission = await handle.requestPermission({
    mode: "readwrite",
  });
  return writePermission === "granted";
}

async function getSavedFileTarget(tab: TabState): Promise<FileTarget | null> {
  if (tab.fileHandle) {
    return tab.fileHandle;
  }

  const handle = await getHandle(`tab:${tab.id}:file`);
  if (!handle || !isBrowserFileHandle(handle)) {
    return null;
  }

  return handle;
}

async function getSavedDirectoryTarget(
  tab: TabState,
): Promise<DirectoryTarget | null> {
  if (tab.directoryHandle) {
    return tab.directoryHandle;
  }

  const handle = await getHandle(`tab:${tab.id}:directory`);
  if (!handle || !isBrowserDirectoryHandle(handle)) {
    return null;
  }

  return handle;
}

async function getSavedWritableFileTarget(
  tab: TabState,
): Promise<FileTarget | null> {
  const target = await getSavedFileTarget(tab);
  if (!target) {
    return null;
  }

  if (isBrowserFileHandle(target)) {
    const hasWriteAccess = await requestBrowserWritePermission(target);
    if (!hasWriteAccess) {
      return null;
    }
  }

  return target;
}

async function getSavedWritableDirectoryTarget(
  tab: TabState,
): Promise<DirectoryTarget | null> {
  const target = await getSavedDirectoryTarget(tab);
  if (!target) {
    return null;
  }

  if (isBrowserDirectoryHandle(target)) {
    const hasWriteAccess = await requestBrowserWritePermission(target);
    if (!hasWriteAccess) {
      return null;
    }
  }

  return target;
}

function buildFileRestoreMessage(fileName: string): string {
  return `Live access to "${fileName}" is unavailable. Open the file again to restore commenting and share review.`;
}

function buildFolderRestoreMessage(input: {
  directoryName: string;
  fileName: string | null;
}): string {
  if (input.fileName) {
    return `Live access to folder "${input.directoryName}" is unavailable. Open the folder again to restore "${input.fileName}" and resume commenting.`;
  }

  return `Live access to folder "${input.directoryName}" is unavailable. Open the folder again to restore its contents.`;
}

async function restoreActiveFileFromTree(input: {
  tree: TabState["fileTree"];
  activeFilePath: string | null;
  persistedFileName: string | null;
  persistedRawContent: string;
}): Promise<{
  fileHandle: FileTarget | null;
  fileName: string | null;
  rawContent: string;
  restoreMessage: string | null;
}> {
  const { tree, activeFilePath, persistedFileName, persistedRawContent } =
    input;

  if (!activeFilePath) {
    return {
      fileHandle: null,
      fileName: persistedFileName,
      rawContent: persistedRawContent,
      restoreMessage: null,
    };
  }

  const fileNode = findLiveFileInTree(tree, activeFilePath);
  if (!fileNode) {
    const fallbackName =
      persistedFileName ?? activeFilePath.split("/").pop() ?? null;
    return {
      fileHandle: null,
      fileName: fallbackName,
      rawContent: persistedRawContent,
      restoreMessage:
        fallbackName !== null
          ? `The last open file "${fallbackName}" is no longer available in this folder. Open the folder again to restore live access.`
          : `The last open file is no longer available in this folder. Open the folder again to restore live access.`,
    };
  }

  try {
    const rawContent = await readFile(fileNode.handle);
    return {
      fileHandle: fileNode.handle,
      fileName: fileNode.name,
      rawContent,
      restoreMessage: null,
    };
  } catch (error) {
    console.warn(
      "[restoreActiveFileFromTree] file read failed, keeping persisted content:",
      error,
    );
    return {
      fileHandle: null,
      fileName: fileNode.name,
      rawContent: persistedRawContent,
      restoreMessage: `Live access to "${fileNode.name}" is unavailable. Open the folder again to restore commenting and share review.`,
    };
  }
}

export function createWorkspaceControllerActions<
  StoreState extends WorkspaceState & AgentRunCloseGuardState,
>(
  deps: WorkspaceControllerActionDeps<StoreState>,
): Pick<
  WorkspaceActions,
  | "reopenFromHistory"
  | "removeHistoryEntry"
  | "clearHistory"
  | "removeTab"
  | "switchTab"
  | "openFileInNewTab"
  | "openDirectoryInNewTab"
  | "openDirectoryHandleInNewTab"
  | "reopenTab"
  | "selectFile"
  | "refreshFile"
  | "refreshFileTree"
  | "restoreTabs"
> {
  const { get, set, scanAllFileComments, showToast, syncActiveShares } = deps;

  async function openDirectoryTargetInNewTab(
    handle: DirectoryTarget,
    name: string,
  ) {
    const existingTab = await findTabByHandle(get().tabs, handle, "directory");
    if (existingTab) {
      set({ activeTabId: existingTab.id });
      return;
    }

    const tab = createDefaultTab({
      label: name,
      directoryHandle: handle,
      directoryName: name,
      sidebarOpen: true,
    });

    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }));

    await saveBrowserHandle(`tab:${tab.id}:directory`, handle);
    const tree = await buildFileTree(handle);
    set((state) => ({
      tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({ fileTree: tree })),
    }));

    if (get().activeTabId === tab.id) {
      await scanAllFileComments();
    }
  }

  return {
    reopenFromHistory: async (entryId) => {
      const entry = get().history.find(
        (historyEntry) => historyEntry.id === entryId,
      );
      if (!entry) {
        return;
      }

      const handle = await getHandle(`history:${entryId}`);
      if (!handle) {
        const updatedHistory = removeHistoryEntryFromState(
          get().history,
          entryId,
        );
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
          const readPermission = await handle.requestPermission({
            mode: "read",
          });
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

      const updatedHistory = removeHistoryEntryFromState(
        get().history,
        entryId,
      );
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
        tabs: buildUpdatedActiveTabs(
          state.tabs,
          state.activeTabId,
          (tabState) => ({
            shares: tabShares,
            shareKeys: { ...tabState.shareKeys, ...restoredKeys },
          }),
        ),
      }));
    },

    removeHistoryEntry: (entryId) => {
      const updatedHistory = removeHistoryEntryFromState(
        get().history,
        entryId,
      );
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

    removeTab: (tabId) => {
      const state = get();
      const { activeTabId, tabs } = state;
      const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex === -1) {
        return;
      }

      if (hasBlockingAgentRunForTab(state, tabId)) {
        showToast("Stop the active agent run before closing this tab.");
        return;
      }

      const tab = tabs[tabIndex];
      const nextTabState = removeTabFromState(tabs, activeTabId, tabId);
      if (!nextTabState) {
        return;
      }
      const nextAgentRunState = removeTabAgentRunState(state, tabId);

      const docIdsToUnsubscribe: string[] = [];
      for (const share of tab.shares) {
        const isStillOpen = nextTabState.updatedTabs.some((currentTab) =>
          currentTab.shares.some(
            (currentShare) => currentShare.docId === share.docId,
          ),
        );
        if (!isStillOpen) {
          docIdsToUnsubscribe.push(share.docId);
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

        void migrateHandleToHistory(
          handleKey,
          historyEntry.id,
          nextHistory,
          get,
        ).catch((error) =>
          console.warn("[history] handle migration failed:", error),
        );

        saveWorkspaceHistory(nextHistory);
        set({
          tabs: nextTabState.updatedTabs,
          activeTabId: nextTabState.nextActiveTabId,
          history: nextHistory,
          ...nextAgentRunState,
        });
      } else {
        removeHandle(`tab:${tabId}:directory`).catch((error) =>
          console.warn("[handleStore] cleanup failed:", error),
        );
        removeHandle(`tab:${tabId}:file`).catch((error) =>
          console.warn("[handleStore] cleanup failed:", error),
        );
        set({
          tabs: nextTabState.updatedTabs,
          activeTabId: nextTabState.nextActiveTabId,
          ...nextAgentRunState,
        });
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

      await restoreDirectoryTabState({
        get,
        set,
        tabId,
        scanAllFileComments,
        requestPermissionOnPrompt: true,
      });
    },

    openFileInNewTab: async () => {
      try {
        const result = await openFile();
        if (!result) {
          return;
        }

        const existingTab = await findTabByHandle(
          get().tabs,
          result.handle,
          "file",
        );
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
        await saveBrowserHandle(`tab:${tab.id}:file`, result.handle);
      } catch (error) {
        console.error("[openFileInNewTab] failed to open file:", error);
        showToast("File could not be opened. Check the terminal logs.");
      }
    },

    openDirectoryInNewTab: async () => {
      try {
        const result = await openDirectory();
        if (!result) {
          return;
        }

        await openDirectoryTargetInNewTab(result.handle, result.name);
      } catch (error) {
        console.error("[openDirectoryInNewTab] failed to open folder:", error);
        showToast("Folder could not be opened. Check the terminal logs.");
      }
    },

    openDirectoryHandleInNewTab: async (handle) => {
      try {
        await openDirectoryTargetInNewTab(handle, handle.name);
      } catch (error) {
        console.error(
          "[openDirectoryHandleInNewTab] failed to open folder:",
          error,
        );
        showToast("Folder could not be opened. Check the terminal logs.");
      }
    },

    reopenTab: async (tabId) => {
      const tab = get().tabs.find((currentTab) => currentTab.id === tabId);
      if (!tab) {
        return;
      }

      if (tab.directoryName) {
        try {
          const target = await getSavedWritableDirectoryTarget(tab);
          if (!target) {
            set((state) => ({
              tabs: buildUpdatedTabs(state.tabs, tabId, () => ({
                restoreError: buildFolderRestoreMessage({
                  directoryName: tab.directoryName,
                  fileName: tab.fileName,
                }),
              })),
            }));
            showToast("The browser did not grant folder access");
            return;
          }

          await saveBrowserHandle(`tab:${tabId}:directory`, target);
          const tree = await buildFileTree(target);
          const restoredFile = await restoreActiveFileFromTree({
            tree,
            activeFilePath: tab.activeFilePath,
            persistedFileName: tab.fileName,
            persistedRawContent: tab.rawContent,
          });
          set((state) => ({
            tabs: buildUpdatedTabs(state.tabs, tabId, () => ({
              directoryHandle: target,
              directoryName: target.name,
              label: target.name,
              fileTree: tree,
              fileHandle: restoredFile.fileHandle,
              fileName: restoredFile.fileName,
              rawContent: restoredFile.rawContent,
              writeAllowed: restoredFile.restoreMessage === null,
              commentPanelOpen: tab.commentPanelOpen,
              sharedPanelOpen: tab.sharedPanelOpen,
              restoreError: restoredFile.restoreMessage,
            })),
          }));

          if (
            get().activeTabId === tabId &&
            tree.length > 0 &&
            restoredFile.restoreMessage === null
          ) {
            await scanAllFileComments();
          }
          if (restoredFile.restoreMessage === null) {
            showToast("Access restored — commenting is back");
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
        return;
      }

      try {
        const target = await getSavedWritableFileTarget(tab);
        if (!target) {
          set((state) => ({
            tabs: buildUpdatedTabs(state.tabs, tabId, () => ({
              restoreError: buildFileRestoreMessage(
                tab.fileName ?? "this file",
              ),
            })),
          }));
          showToast("The browser did not grant file access");
          return;
        }

        await saveBrowserHandle(`tab:${tabId}:file`, target);
        const rawContent = await readFile(target);
        set((state) => ({
          tabs: buildUpdatedTabs(state.tabs, tabId, () => ({
            fileHandle: target,
            fileName: target.name,
            label: target.name,
            rawContent,
            writeAllowed: true,
            restoreError: null,
          })),
        }));
        showToast("Access restored — commenting is back");
      } catch (error) {
        console.error("[reopenTab] failed to reopen file tab:", tabId, error);
        set((state) => ({
          tabs: buildUpdatedTabs(state.tabs, tabId, () => ({
            restoreError: `The file "${tab.fileName}" could not be opened. Please try again.`,
          })),
        }));
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

    refreshFile: async () => {
      const tab = getActiveTab(get());
      if (!tab?.fileHandle) {
        return;
      }

      try {
        const newRawContent = await readFile(tab.fileHandle);
        const changed = newRawContent !== tab.rawContent;
        const newlyResolvedComments = findResolvedComments(
          tab.comments,
          newRawContent,
        );
        set((state) => ({
          tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
            rawContent: newRawContent,
            resolvedComments: [
              ...tab.resolvedComments,
              ...newlyResolvedComments.filter(
                (comment) =>
                  !tab.resolvedComments.some(
                    (resolved) => resolved.raw === comment.raw,
                  ),
              ),
            ],
          })),
        }));
        if (changed) {
          syncActiveShares();
        }
      } catch (error) {
        console.error("[refreshFile] file read failed:", error);

        if (tab.directoryHandle) {
          try {
            const tree = await buildFileTree(tab.directoryHandle);
            const restoredFile = await restoreActiveFileFromTree({
              tree,
              activeFilePath: tab.activeFilePath,
              persistedFileName: tab.fileName,
              persistedRawContent: tab.rawContent,
            });

            set((state) => ({
              tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({
                fileTree: tree,
                fileHandle: restoredFile.fileHandle,
                fileName: restoredFile.fileName,
                rawContent: restoredFile.rawContent,
                writeAllowed: restoredFile.restoreMessage === null,
                commentPanelOpen: tab.commentPanelOpen,
                sharedPanelOpen: tab.sharedPanelOpen,
                restoreError: restoredFile.restoreMessage,
              })),
            }));

            if (restoredFile.restoreMessage === null) {
              await scanAllFileComments();
            }
            return;
          } catch (recoveryError) {
            console.error(
              "[refreshFile] directory recovery after file read failure failed:",
              recoveryError,
            );
          }
        }

        const fileName = tab.fileName ?? "file";
        set((state) => ({
          tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({
            ...buildRestoreAccessState(buildFileRestoreMessage(fileName)),
          })),
        }));
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
        const restoredFile = await restoreActiveFileFromTree({
          tree,
          activeFilePath: tab.activeFilePath,
          persistedFileName: tab.fileName,
          persistedRawContent: tab.rawContent,
        });
        set((state) => ({
          tabs: buildUpdatedTabs(state.tabs, tabId, () => ({
            fileTree: tree,
            fileHandle: restoredFile.fileHandle,
            fileName: restoredFile.fileName,
            rawContent: restoredFile.rawContent,
            writeAllowed: restoredFile.restoreMessage === null,
            commentPanelOpen: tab.commentPanelOpen,
            sharedPanelOpen: tab.sharedPanelOpen,
            restoreError: restoredFile.restoreMessage,
          })),
        }));
        if (restoredFile.restoreMessage === null) {
          await scanAllFileComments();
        }
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
            await restoreDirectoryTabState({
              get,
              set,
              tabId: tab.id,
              scanAllFileComments,
              requestPermissionOnPrompt: false,
            });
          } catch (error) {
            console.error(
              "[restoreTabs] failed to restore directory tab:",
              tab.id,
              error,
            );
          }
        } else if (tab.fileName) {
          try {
            if (tab.fileHandle && isNativeFileTarget(tab.fileHandle)) {
              const restoredRawContent = await readFile(tab.fileHandle);
              set((state) => ({
                tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({
                  rawContent: restoredRawContent,
                  writeAllowed: true,
                  restoreError: null,
                })),
              }));
              continue;
            }

            const handle = await getHandle(`tab:${tab.id}:file`);
            if (!handle || handle.kind !== "file") {
              console.warn(
                "[restoreTabs] no handle in IndexedDB for file tab:",
                tab.id,
                tab.fileName,
              );
              set((state) => ({
                tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({
                  ...buildRestoreAccessState(
                    buildFileRestoreMessage(tab.fileName),
                  ),
                })),
              }));
              continue;
            }

            const readPermission = await handle.queryPermission({
              mode: "read",
            });
            const writePermission = await handle.queryPermission({
              mode: "readwrite",
            });
            console.log("[restoreTabs] file tab permissions", {
              tabId: tab.id,
              fileName: tab.fileName,
              readPermission,
              writePermission,
            });
            const hasReadAccess =
              readPermission === "granted" || writePermission === "granted";
            const hasWriteAccess = writePermission === "granted";

            let restoredRawContent: string | null = null;
            if (hasReadAccess) {
              try {
                restoredRawContent = await readFile(handle);
              } catch (error) {
                console.warn(
                  "[restoreTabs] file read failed, keeping persisted content:",
                  error,
                );
              }
            } else {
              console.warn(
                "[restoreTabs] file tab access is not granted during restore:",
                tab.id,
                tab.fileName,
              );
            }

            const restoreMessage = hasWriteAccess
              ? null
              : buildFileRestoreMessage(tab.fileName);

            set((state) => ({
              tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({
                fileHandle: hasReadAccess ? handle : null,
                writeAllowed: hasWriteAccess,
                commentPanelOpen: tab.commentPanelOpen,
                sharedPanelOpen: tab.sharedPanelOpen,
                restoreError: restoreMessage,
                ...(restoredRawContent !== null
                  ? { rawContent: restoredRawContent }
                  : {}),
              })),
            }));
          } catch (error) {
            console.error(
              "[restoreTabs] failed to restore file tab:",
              tab.id,
              error,
            );
            set((state) => ({
              tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({
                ...buildRestoreAccessState(
                  buildFileRestoreMessage(tab.fileName),
                ),
              })),
            }));
          }
        }
      }

      const allShares = loadAndCleanShares(get().tabs);
      const now = new Date();

      for (const tab of get().tabs) {
        const tabShares = allShares[stableShareKey(tab)] ?? [];
        if (tabShares.length === 0) {
          continue;
        }

        const activeShares = tabShares.filter(
          (share) => new Date(share.expiresAt) > now,
        );
        if (activeShares.length === 0) {
          continue;
        }

        const restoredKeys = await restoreShareKeys(activeShares);
        set((state) => ({
          tabs: buildUpdatedTabs(state.tabs, tab.id, (tabState) => ({
            shares: activeShares,
            shareKeys: { ...tabState.shareKeys, ...restoredKeys },
          })),
        }));
      }

      const activeShares: ShareRecord[] = [];
      for (const tab of get().tabs) {
        activeShares.push(...tab.shares);
      }
      ensureRelaySubscriptions(activeShares);
    },
  };
}
