import { useAppStore } from "../../store";
import type { TabState } from "../../types/tab";
import { getActiveTab } from "./helpers";

export { getActiveTab } from "./helpers";

export function useActiveTab(): TabState | null {
  return useAppStore((state) => getActiveTab(state));
}

export function useActiveTabField<Key extends keyof TabState>(
  field: Key,
): TabState[Key] | undefined {
  return useAppStore((state) => {
    const tab = getActiveTab(state);
    return tab?.[field];
  });
}
