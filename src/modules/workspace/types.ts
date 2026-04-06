import type { HistoryEntry } from "../../types/history";
import type { FileNode } from "../../types/fileTree";
import type { TabState } from "../../types/tab";

export interface WorkspaceState {
  tabs: TabState[];
  activeTabId: string | null;
  history: HistoryEntry[];
  historyDropdownOpen: boolean;
}

export interface WorkspaceActions {
  addTab: (tab: TabState) => void;
  removeTab: (tabId: string) => void;
  switchTab: (tabId: string) => Promise<void>;
  openFileInNewTab: () => Promise<void>;
  openDirectoryInNewTab: () => Promise<void>;
  reopenTab: (tabId: string) => Promise<void>;
  reopenFromHistory: (entryId: string) => Promise<void>;
  removeHistoryEntry: (entryId: string) => void;
  clearHistory: () => void;
  toggleHistoryDropdown: () => void;
  selectFile: (node: FileNode) => Promise<void>;
  clearFile: () => void;
  toggleSidebar: () => void;
  refreshFile: () => Promise<void>;
  refreshFileTree: () => Promise<void>;
  restoreTabs: () => Promise<void>;
}

export interface WorkspaceControllerDeps {
  scanAllFileComments: () => Promise<void>;
  showToast: (message: string) => void;
  syncActiveShares: () => void;
}
