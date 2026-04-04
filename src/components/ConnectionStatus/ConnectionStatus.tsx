import { useAppStore } from "../../store";
import "./ConnectionStatus.css";

export function ConnectionStatus() {
  const relayStatus = useAppStore((state) => state.relayStatus);
  const isPeerMode = useAppStore((state) => state.isPeerMode);
  const activeTabHasShares = useAppStore((state) => {
    if (state.isPeerMode) {
      return false;
    }
    const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
    if (!activeTab) {
      return false;
    }
    const now = new Date();
    return activeTab.shares.some((share) => new Date(share.expiresAt) > now);
  });

  if (!isPeerMode && !activeTabHasShares) {
    return null;
  }

  const labels: Record<string, string> = {
    connected: "Connected",
    connecting: "Connecting...",
    disconnected: "Offline",
  };

  return (
    <span className="connection-status" data-status={relayStatus}>
      <span className="connection-status__dot" />
      <span className="connection-status__label">{labels[relayStatus]}</span>
    </span>
  );
}
