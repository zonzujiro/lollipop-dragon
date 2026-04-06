import type { StoreApi } from "zustand";
import type { RelayActions, RelayState } from "./types";

type SetState<StoreState> = StoreApi<StoreState>["setState"];

export function createRelayState(): RelayState {
  return {
    relayStatus: "disconnected",
    documentUpdateAvailable: false,
  };
}

export function createRelayActions<StoreState extends RelayState>(
  set: SetState<StoreState>,
): RelayActions {
  return {
    setRelayStatus: (status) => {
      set({ relayStatus: status });
    },
    setDocumentUpdateAvailable: (available) => {
      set({ documentUpdateAvailable: available });
    },
    dismissDocumentUpdate: () => {
      set({ documentUpdateAvailable: false });
    },
  };
}
