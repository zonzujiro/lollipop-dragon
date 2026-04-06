import type { StoreApi } from "zustand";
import { requestPresentationFullscreen } from "./controller";
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
): AppShellActions {
  return {
    setTheme: (theme) => {
      set({ theme });
    },
    toggleFocusMode: () => {
      set((state) => ({ focusMode: !state.focusMode }));
    },
    enterPresentationMode: () => {
      void requestPresentationFullscreen(document);
      set({ presentationMode: true });
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
