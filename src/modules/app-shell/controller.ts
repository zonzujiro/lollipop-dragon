import type { StoreApi } from "zustand";
import type { AppShellActions, AppShellState } from "./types";

export async function requestPresentationFullscreen(doc: Document) {
  if (!doc.documentElement.requestFullscreen) {
    return;
  }

  try {
    await doc.documentElement.requestFullscreen();
  } catch (error) {
    console.warn("[app-shell] failed to enter fullscreen", error);
  }
}

type SetState<StoreState> = StoreApi<StoreState>["setState"];

export function createAppShellControllerActions<
  StoreState extends AppShellState,
>(set: SetState<StoreState>): Pick<AppShellActions, "enterPresentationMode"> {
  return {
    enterPresentationMode: () => {
      void requestPresentationFullscreen(document);
      set({ presentationMode: true });
    },
  };
}
