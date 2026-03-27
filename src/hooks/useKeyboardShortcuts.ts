import { useEffect } from "react";
import { useAppStore } from "../store";

export function useKeyboardShortcuts() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  useEffect(() => {
    const removeTab = useAppStore.getState().removeTab;
    const switchTab = useAppStore.getState().switchTab;
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "b") {
        e.preventDefault();
        toggleSidebar();
      } else if (meta && e.key === "w") {
        e.preventDefault();
        const { activeTabId } = useAppStore.getState();
        if (activeTabId) {
          removeTab(activeTabId);
        }
      } else if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        const state = useAppStore.getState();
        if (state.tabs.length < 2) {
          return;
        }
        const idx = state.tabs.findIndex((t) => t.id === state.activeTabId);
        const next = e.shiftKey
          ? (idx - 1 + state.tabs.length) % state.tabs.length
          : (idx + 1) % state.tabs.length;
        switchTab(state.tabs[next].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);
}
