import type { StoreApi } from "zustand";
import { findLiveFileInTree } from "../../types/fileTree";
import type { HistoryEntry } from "../../types/history";
import type { TabState } from "../../types/tab";
import { buildUpdatedTabs } from "./helpers";
import { buildFileTree, getHandle, readFile, removeHandle, saveHandle } from "./storage";
import type { WorkspaceState } from "./types";

type SetState<StoreState> = StoreApi<StoreState>["setState"];

const HISTORY_KEY = "markreview-history";
const HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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
    (entry) => !nextHistory.some((historyEntry) => historyEntry.id === entry.id),
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

export async function restoreDirectoryTabState<StoreState extends WorkspaceState>(
  get: () => StoreState,
  set: SetState<StoreState>,
  tabId: string,
  scanAllFileComments: () => Promise<void>,
): Promise<void> {
  const tab = get().tabs.find((currentTab) => currentTab.id === tabId);
  if (!tab?.directoryName) {
    return;
  }

  try {
    const handle = await getHandle(`tab:${tab.id}:directory`);
    if (!handle || handle.kind !== "directory") {
      console.debug(
        "[restoreDirectoryTabState] no saved directory handle:",
        tab.id,
        tab.directoryName,
      );
      set((state) => ({
        tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({
          restoreError: `The folder "${tab.directoryName}" could not be accessed. It may have been moved, renamed, or deleted.`,
        })),
      }));
      return;
    }

    let readPermission = await handle.queryPermission({ mode: "read" });
    if (readPermission !== "granted") {
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
          restoreError: `The folder "${tab.directoryName}" requires permission to access. Please reopen it.`,
        })),
      }));
      return;
    }

    const tree = await buildFileTree(handle);
    let restoredFileHandle: FileSystemFileHandle | null = null;
    let restoredFileName: string | null = null;
    let restoredRawContent: string | null = null;

    if (tab.activeFilePath) {
      const fileNode = findLiveFileInTree(tree, tab.activeFilePath);
      if (fileNode) {
        restoredFileHandle = fileNode.handle;
        restoredFileName = fileNode.name;
        try {
          restoredRawContent = await readFile(fileNode.handle);
        } catch (error) {
          console.warn(
            "[restoreDirectoryTabState] file read failed, keeping persisted content:",
            error,
          );
        }
      }
    }

    set((state) => ({
      tabs: buildUpdatedTabs(state.tabs, tab.id, () => ({
        directoryHandle: handle,
        directoryName: handle.name,
        fileTree: tree,
        restoreError: null,
        ...(restoredFileHandle ? { fileHandle: restoredFileHandle } : {}),
        ...(restoredFileName ? { fileName: restoredFileName } : {}),
        ...(restoredRawContent !== null
          ? { rawContent: restoredRawContent }
          : {}),
      })),
    }));

    if (get().activeTabId === tab.id && tree.length > 0) {
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
        fileHandle: null,
        restoreError: `The folder "${directoryName}" could not be accessed. It may have been moved, renamed, or deleted.`,
      })),
    }));
  }
}

export async function findTabByHandle(
  tabs: TabState[],
  handle: FileSystemFileHandle | FileSystemDirectoryHandle,
  kind: "file" | "directory",
): Promise<TabState | null> {
  for (const tab of tabs) {
    const existingHandle =
      kind === "file" ? tab.fileHandle : tab.directoryHandle;
    if (existingHandle && (await existingHandle.isSameEntry(handle))) {
      return tab;
    }
  }

  return null;
}
