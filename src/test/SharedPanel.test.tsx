import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { SharedPanel } from "../components/SharedPanel";
import { useAppStore } from "../store";
import { setTestState, resetTestStore, makeShare } from "./testHelpers";

vi.mock("../services/relay", () => ({
  isDocSubscribed: vi.fn(() => false),
}));

import { isDocSubscribed } from "../services/relay";
const mockIsDocSubscribed = vi.mocked(isDocSubscribed);

beforeEach(() => {
  resetTestStore();
  setTestState({
    shares: [],
    sharedPanelOpen: true,
    pendingComments: {},
    fileName: null,
    activeFilePath: null,
  });
  useAppStore.setState({
    toggleSharedPanel: vi.fn(),
    revokeShare: vi.fn(),
    fetchPendingComments: vi.fn(),
    mergeComment: vi.fn(),
    dismissComment: vi.fn(),
    clearPendingComments: vi.fn(),
  });
  vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
});

describe("SharedPanel — empty state", () => {
  it("shows empty state message when no shares", () => {
    render(<SharedPanel />);
    expect(screen.getByText(/No active shares/)).toBeInTheDocument();
  });

  it("calls toggleSharedPanel when close button clicked", async () => {
    const toggleSharedPanel = vi.fn();
    useAppStore.setState({ toggleSharedPanel });
    const user = userEvent.setup();
    render(<SharedPanel />);
    await user.click(
      screen.getByRole("button", { name: "Close shared panel" }),
    );
    expect(toggleSharedPanel).toHaveBeenCalledOnce();
  });
});

describe("SharedPanel — share list", () => {
  beforeEach(() => {
    setTestState({ shares: [makeShare()] });
  });

  it("renders share label", () => {
    render(<SharedPanel />);
    expect(screen.getByText("my-doc")).toBeInTheDocument();
  });

  it("shows pending badge when pendingCommentCount > 0", () => {
    setTestState({ shares: [makeShare({ pendingCommentCount: 3 })] });
    render(<SharedPanel />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("does not show badge when pendingCommentCount is 0", () => {
    render(<SharedPanel />);
    // Badge text would be '0', but it should not render
    expect(screen.queryByTitle(/0 pending/)).not.toBeInTheDocument();
  });

  it("shows Check comments and Revoke buttons", () => {
    render(<SharedPanel />);
    expect(
      screen.getByRole("button", { name: /Check comments/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Revoke/ })).toBeInTheDocument();
  });

  it("hides Check comments when docId is subscribed via relay", () => {
    mockIsDocSubscribed.mockReturnValue(true);
    render(<SharedPanel />);
    expect(
      screen.queryByRole("button", { name: /Check comments/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Revoke/ })).toBeInTheDocument();
    mockIsDocSubscribed.mockReturnValue(false);
  });

  it("calls revokeShare when Revoke is clicked", async () => {
    const revokeShare = vi.fn();
    useAppStore.setState({ revokeShare });
    const user = userEvent.setup();
    render(<SharedPanel />);
    await user.click(screen.getByRole("button", { name: /Revoke/ }));
    expect(revokeShare).toHaveBeenCalledWith("doc-1");
  });

  it("calls fetchPendingComments and expands on Check comments click", async () => {
    const fetchPendingComments = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({ fetchPendingComments });
    setTestState({ pendingComments: { "doc-1": [] } });
    const user = userEvent.setup();
    render(<SharedPanel />);
    await user.click(screen.getByRole("button", { name: /Check comments/ }));
    await waitFor(() => {
      expect(fetchPendingComments).toHaveBeenCalledWith("doc-1");
    });
    // After fetch and expand, should show "No pending comments" since array is empty
    await waitFor(() => {
      expect(screen.getByText("No pending comments.")).toBeInTheDocument();
    });
  });
});

describe("SharedPanel — expiry display", () => {
  it("shows expiry in days and hours for future date", () => {
    setTestState({
      shares: [
        makeShare({
          expiresAt: new Date(
            Date.now() + 2 * 86400000 + 3 * 3600000,
          ).toISOString(),
        }),
      ],
    });
    render(<SharedPanel />);
    expect(screen.getByText(/Expires in 2d/)).toBeInTheDocument();
  });

  it('shows "Expired" for past date', () => {
    setTestState({
      shares: [
        makeShare({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
      ],
    });
    render(<SharedPanel />);
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });
});
