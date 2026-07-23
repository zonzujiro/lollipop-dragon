import type { StoreApi } from "zustand";
import type { AppShellActions, AppShellState } from "./types";

type SetState<StoreState> = StoreApi<StoreState>["setState"];

export function createAppShellState(): AppShellState {
  return {
    theme: "light",
    focusMode: false,
    agentSettingsOpen: false,
    toast: null,
  };
}

export function createAppShellActions<StoreState extends AppShellState>(
  set: SetState<StoreState>,
): Pick<
  AppShellActions,
  | "setTheme"
  | "toggleFocusMode"
  | "openAgentSettings"
  | "closeAgentSettings"
  | "showToast"
  | "dismissToast"
> {
  return {
    setTheme: (theme) => {
      set({ theme });
    },
    toggleFocusMode: () => {
      set((state) => ({ focusMode: !state.focusMode }));
    },
    openAgentSettings: () => {
      set({ agentSettingsOpen: true });
    },
    closeAgentSettings: () => {
      set({ agentSettingsOpen: false });
    },
    showToast: (message) => {
      set({ toast: message });
    },
    dismissToast: () => {
      set({ toast: null });
    },
  };
}
