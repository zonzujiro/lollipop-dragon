import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ConnectionStatus } from "./index";
import {
  makeShare,
  resetTestStore,
  setTestState,
} from "../../../testing/testHelpers";

beforeEach(() => {
  resetTestStore();
});

describe("ConnectionStatus - peer mode", () => {
  it("renders the healthy live state in peer mode", () => {
    setTestState(
      {},
      {
        isPeerMode: true,
        relayStatus: "connected",
        peerSubmissionSubscription: {
          subscriptionId: "peer-sub",
          phase: "live",
          lastError: null,
        },
      },
    );
    render(<ConnectionStatus />);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it('renders "Connecting..." when relayStatus is connecting in peer mode', () => {
    setTestState({}, { isPeerMode: true, relayStatus: "connecting" });
    render(<ConnectionStatus />);
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
  });

  it("does not claim Live when the socket is open but the document is unconfirmed", () => {
    setTestState({}, { isPeerMode: true, relayStatus: "connected" });
    render(<ConnectionStatus />);
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
  });

  it('renders "Offline" when relayStatus is disconnected in peer mode', () => {
    setTestState({}, { isPeerMode: true, relayStatus: "disconnected" });
    render(<ConnectionStatus />);
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("sets data-status attribute from relayStatus", () => {
    setTestState({}, { isPeerMode: true, relayStatus: "connecting" });
    render(<ConnectionStatus />);
    const statusElement = screen
      .getByText("Connecting…")
      .closest(".connection-status");
    expect(statusElement).toHaveAttribute("data-status", "connecting");
  });
});

describe("ConnectionStatus - host mode with active shares", () => {
  it("renders the healthy live state when active tab has a non-expired share", () => {
    const activeShare = makeShare({
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    setTestState(
      {
        shares: [activeShare],
        incomingReviewSessions: {
          [activeShare.docId]: {
            ownerWorkspaceId: "test-workspace",
            subscription: {
              subscriptionId: "host-sub",
              phase: "live",
              lastError: null,
            },
            quarantinedItems: [],
          },
        },
      },
      { isPeerMode: false, relayStatus: "connected" },
    );
    render(<ConnectionStatus />);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("renders non-healthy status when active tab has a non-expired share", () => {
    const activeShare = makeShare({
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    setTestState(
      { shares: [activeShare] },
      { isPeerMode: false, relayStatus: "connecting" },
    );
    render(<ConnectionStatus />);
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
  });

  it("does not render when active tab only has expired shares", () => {
    const expiredShare = makeShare({
      expiresAt: new Date(Date.now() - 86400000).toISOString(),
    });
    setTestState(
      { shares: [expiredShare] },
      { isPeerMode: false, relayStatus: "connected" },
    );
    const { container } = render(<ConnectionStatus />);
    expect(container.firstChild).toBeNull();
  });
});

describe("ConnectionStatus - hidden when not relevant", () => {
  it("returns null when not in peer mode and no active shares", () => {
    setTestState(
      { shares: [] },
      { isPeerMode: false, relayStatus: "connected" },
    );
    const { container } = render(<ConnectionStatus />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when not in peer mode and no active tab", () => {
    resetTestStore();
    const { container } = render(<ConnectionStatus />);
    expect(container.firstChild).toBeNull();
  });
});
