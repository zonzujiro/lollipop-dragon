import { toFileTreeNodes } from "../../types/fileTree";
import type { FileTreeNode } from "../../types/fileTree";
import type { TabState } from "../../types/tab";

export function getActiveTab(state: {
  tabs: TabState[];
  activeTabId: string | null;
}): TabState | null {
  if (!state.activeTabId) {
    return null;
  }

  return state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;
}

export function buildUpdatedTabs(
  tabs: TabState[],
  tabId: string,
  updater: (tab: TabState) => Partial<TabState>,
): TabState[] {
  return tabs.map((tab) =>
    tab.id === tabId ? { ...tab, ...updater(tab) } : tab,
  );
}

export function buildUpdatedActiveTabs(
  tabs: TabState[],
  activeTabId: string | null,
  updater: (tab: TabState) => Partial<TabState>,
): TabState[] {
  if (!activeTabId) {
    return tabs;
  }

  return buildUpdatedTabs(tabs, activeTabId, updater);
}

export function getLiveFileTree(tab: TabState): FileTreeNode[] {
  return toFileTreeNodes(tab.fileTree);
}

export function needsDirectoryTabRestore(tab: TabState): boolean {
  const isMissingDirectoryHandle = tab.directoryHandle === null;
  const isMissingLiveFileTree = getLiveFileTree(tab).length === 0;
  const isMissingActiveFileHandle =
    tab.activeFilePath !== null && tab.fileHandle === null;

  return (
    isMissingDirectoryHandle ||
    isMissingLiveFileTree ||
    isMissingActiveFileHandle
  );
}
