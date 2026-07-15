import { getActiveTab } from "../modules/workspace/helpers";
import type { TabState } from "../types/tab";
import { useAppStore } from ".";

export { getActiveTab } from "../modules/workspace/helpers";

export function useActiveTab(): TabState | null {
  return useAppStore((state) => getActiveTab(state));
}

export function useActiveTabField<Key extends keyof TabState>(
  field: Key,
): TabState[Key] | undefined {
  return useAppStore((state) => getActiveTab(state)?.[field]);
}
