export type RelayStatus = "disconnected" | "connecting" | "connected";

export interface RelayState {
  relayStatus: RelayStatus;
  documentUpdateAvailable: boolean;
}

export interface RelayActions {
  setRelayStatus: (status: RelayStatus) => void;
  setDocumentUpdateAvailable: (available: boolean) => void;
  dismissDocumentUpdate: () => void;
}
