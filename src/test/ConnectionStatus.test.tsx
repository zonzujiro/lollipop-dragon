import { render, screen } from "@testing-library/react";
import { beforeEach, describe, it, expect } from "vitest";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { setTestState, resetTestStore, makeShare } from "./testHelpers";

beforeEach(() => {
  resetTestStore();
});

describe("ConnectionStatus — peer mode", () => {
  it('renders "Connected" when relayStatus is connected in peer mode', () => {
    setTestState({}, { isPeerMode: true, relayStatus: "connected" });
    render(<ConnectionStatus />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it('renders "Connecting..." when relayStatus is connecting in peer mode', () => {
    setTestState({}, { isPeerMode: true, relayStatus: "connecting" });
    render(<ConnectionStatus />);
    expect(screen.getByText("Connecting...")).toBeInTheDocument();
  });

  it('renders "Offline" when relayStatus is disconnected in peer mode', () => {
    setTestState({}, { isPeerMode: true, relayStatus: "disconnected" });
    render(<ConnectionStatus />);
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("sets data-status attribute from relayStatus", () => {
    setTestState({}, { isPeerMode: true, relayStatus: "connected" });
    render(<ConnectionStatus />);
    const statusEl = screen
      .getByText("Connected")
      .closest(".connection-status");
    expect(statusEl).toHaveAttribute("data-status", "connected");
  });
});

describe("ConnectionStatus — host mode with active shares", () => {
  it("renders when active tab has a non-expired share", () => {
    const activeShare = makeShare({
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    setTestState(
      { shares: [activeShare] },
      { isPeerMode: false, relayStatus: "connected" },
    );
    render(<ConnectionStatus />);
    expect(screen.getByText("Connected")).toBeInTheDocument();
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

describe("ConnectionStatus — hidden when not relevant", () => {
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
