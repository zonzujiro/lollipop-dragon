import type { TabState } from "../../../types/tab";
import type { RelayStatus } from "../../../modules/relay";
import { useAppStore } from "../../../store";
import "./ConnectionStatus.css";

function selectVisibleConnectionStatus(state: {
  isPeerMode: boolean;
  tabs: TabState[];
  activeTabId: string | null;
  relayStatus: RelayStatus;
  peerSubmissionSubscription: {
    phase: "idle" | "subscribing" | "syncing" | "live" | "failed";
  } | null;
}): RelayStatus | null {
  if (state.isPeerMode) {
    const phase = state.peerSubmissionSubscription?.phase;
    if (phase === "live") {
      return "connected";
    }
    if (phase === "subscribing" || phase === "syncing") {
      return "connecting";
    }
    return state.relayStatus === "disconnected" ? "disconnected" : "connecting";
  }
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  if (!activeTab) {
    return null;
  }
  const now = new Date();
  const activeShares = activeTab.shares.filter(
    (share) => new Date(share.expiresAt) > now,
  );
  if (activeShares.length === 0) {
    return null;
  }
  const phases = activeShares.map(
    (share) =>
      activeTab.incomingReviewSessions[share.docId]?.subscription.phase,
  );
  if (phases.every((phase) => phase === "live")) {
    return "connected";
  }
  if (
    phases.some((phase) => phase === "subscribing" || phase === "syncing") ||
    state.relayStatus !== "disconnected"
  ) {
    return "connecting";
  }
  return "disconnected";
}

const statusLabels: Record<string, string> = {
  connecting: "Connecting…",
  connected: "Live",
  disconnected: "Offline",
};

export function ConnectionStatus() {
  const relayStatus = useAppStore(selectVisibleConnectionStatus);

  if (!relayStatus) {
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
