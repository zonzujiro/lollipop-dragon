import type { StoreApi } from "zustand";
import type { HistoryEntry } from "../../types/history";
import type { TabState } from "../../types/tab";
import type { WorkspaceActions, WorkspaceState } from "./types";

type SetState<StoreState> = StoreApi<StoreState>["setState"];

interface WorkspaceActionDeps<StoreState extends WorkspaceState> {
  set: SetState<StoreState>;
  buildUpdatedActiveTabs: (
    tabs: TabState[],
    activeTabId: string | null,
    updater: (tab: TabState) => Partial<TabState>,
  ) => TabState[];
}

export function createWorkspaceState(
  initialHistory: HistoryEntry[] = [],
): WorkspaceState {
  return {
    tabs: [],
    activeTabId: null,
    history: initialHistory,
    historyDropdownOpen: false,
  };
}

export function createWorkspaceActions<StoreState extends WorkspaceState>(
  deps: WorkspaceActionDeps<StoreState>,
): Pick<
  WorkspaceActions,
  "toggleHistoryDropdown" | "addTab" | "clearFile" | "toggleSidebar"
> {
  const { set, buildUpdatedActiveTabs } = deps;

  return {
    toggleHistoryDropdown: () => {
      set((state) => ({ historyDropdownOpen: !state.historyDropdownOpen }));
    },

    addTab: (tab) => {
      set((state) => ({
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
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
  };
}
