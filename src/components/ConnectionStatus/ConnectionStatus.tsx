import type { TabState } from "../../types/tab";
import { useAppStore } from "../../store";
import "./ConnectionStatus.css";

function selectActiveTabHasShares(state: {
  isPeerMode: boolean;
  tabs: TabState[];
  activeTabId: string | null;
}): boolean {
  if (state.isPeerMode) {
    return false;
  }
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  if (!activeTab) {
    return false;
  }
  const now = new Date();
  return activeTab.shares.some((share) => new Date(share.expiresAt) > now);
}

const statusLabels: Record<string, string> = {
  connected: "Connected",
  connecting: "Connecting...",
  disconnected: "Offline",
};

export function ConnectionStatus() {
  const relayStatus = useAppStore((state) => state.relayStatus);
  const isPeerMode = useAppStore((state) => state.isPeerMode);
  const activeTabHasShares = useAppStore(selectActiveTabHasShares);

  if (!isPeerMode && !activeTabHasShares) {
    return null;
  }

  return (
    <span className="connection-status" data-status={relayStatus}>
      <span className="connection-status__dot" />
      <span className="connection-status__label">
        {statusLabels[relayStatus]}
      </span>
    </span>
  );
}
