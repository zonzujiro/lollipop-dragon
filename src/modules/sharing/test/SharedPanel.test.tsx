import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SharedPanel } from "../../../components/SharedPanel";
import { useAppStore } from "../../../store";
import {
  resetTestStore,
  setTestState,
  makeShare,
} from "../../../test/testHelpers";

vi.mock("../../../services/relay", () => ({
  isDocSubscribed: vi.fn(() => false),
}));

beforeEach(() => {
  vi.restoreAllMocks();
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
    mergeComment: vi.fn(),
    dismissComment: vi.fn(),
    clearPendingComments: vi.fn(),
  });
  vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
});

describe("SharedPanel", () => {
  it("shows an empty state when no shares exist", () => {
    render(<SharedPanel />);
    expect(screen.getByText(/No active shares/)).toBeInTheDocument();
  });

  it("closes when the close button is clicked", async () => {
    const toggleSharedPanel = vi.fn();
    useAppStore.setState({ toggleSharedPanel });
    const user = userEvent.setup();

    render(<SharedPanel />);
    await user.click(
      screen.getByRole("button", { name: "Close shared panel" }),
    );

    expect(toggleSharedPanel).toHaveBeenCalledOnce();
  });

  it("renders share metadata and pending badge", () => {
    setTestState({
      shares: [makeShare({ pendingCommentCount: 3, label: "my-doc" })],
    });

    render(<SharedPanel />);

    expect(screen.getByText("my-doc")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("hides the pending badge when no comments are queued", () => {
    setTestState({ shares: [makeShare({ pendingCommentCount: 0 })] });

    render(<SharedPanel />);

    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("calls revokeShare for the selected document", async () => {
    const revokeShare = vi.fn();
    useAppStore.setState({ revokeShare });
    setTestState({ shares: [makeShare()] });
    const user = userEvent.setup();

    render(<SharedPanel />);
    await user.click(screen.getByRole("button", { name: /Revoke/i }));

    expect(revokeShare).toHaveBeenCalledWith("doc-1");
  });
});
