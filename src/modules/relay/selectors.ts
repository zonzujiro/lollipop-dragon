import type { RelayState } from "./types";

export function selectRelayStatus<StoreState extends RelayState>(
  state: StoreState,
) {
  return state.relayStatus;
}

export function selectDocumentUpdateAvailable<StoreState extends RelayState>(
  state: StoreState,
) {
  return state.documentUpdateAvailable;
}
