import type { TabState } from "../../../types/tab";
import { selectRelayStatus } from "../../../modules/relay";
import { useAppStore } from "../../../store";
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
  connecting: "Connecting...",
  disconnected: "Offline",
};

export function ConnectionStatus() {
  const relayStatus = useAppStore(selectRelayStatus);
  const isPeerMode = useAppStore((state) => state.isPeerMode);
  const activeTabHasShares = useAppStore(selectActiveTabHasShares);

  if (!isPeerMode && !activeTabHasShares) {
    return null;
  }

  if (relayStatus === "connected") {
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
