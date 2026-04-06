import { useAppStore } from "./index";
import type { TabState } from "../types/tab";

export function getActiveTab(state: {
  tabs: TabState[];
  activeTabId: string | null;
}): TabState | null {
  if (!state.activeTabId) {
    return null;
  }
  return state.tabs.find((t) => t.id === state.activeTabId) ?? null;
}

export function useActiveTab(): TabState | null {
  return useAppStore((s) => getActiveTab(s));
}

export function useActiveTabField<K extends keyof TabState>(
  field: K,
): TabState[K] | undefined {
  return useAppStore((s) => {
    const tab = getActiveTab(s);
    return tab?.[field];
  });
}
