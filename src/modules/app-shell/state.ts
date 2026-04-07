import type { StoreApi } from "zustand";
import type { AppShellActions, AppShellState } from "./types";

type SetState<StoreState> = StoreApi<StoreState>["setState"];

export function createAppShellState(): AppShellState {
  return {
    theme: "light",
    focusMode: false,
    presentationMode: false,
    toast: null,
  };
}

export function createAppShellActions<StoreState extends AppShellState>(
  set: SetState<StoreState>,
): Pick<
  AppShellActions,
  "setTheme" | "toggleFocusMode" | "exitPresentationMode" | "showToast" | "dismissToast"
> {
  return {
    setTheme: (theme) => {
      set({ theme });
    },
    toggleFocusMode: () => {
      set((state) => ({ focusMode: !state.focusMode }));
    },
    exitPresentationMode: () => {
      set({ presentationMode: false });
    },
    showToast: (message) => {
      set({ toast: message });
    },
    dismissToast: () => {
      set({ toast: null });
    },
  };
}
