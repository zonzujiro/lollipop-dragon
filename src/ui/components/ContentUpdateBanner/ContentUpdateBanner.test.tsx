import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContentUpdateBanner } from "./index";
import { useAppStore } from "../../../store";
import { resetTestStore } from "../../../testing/testHelpers";

beforeEach(() => {
  resetTestStore();
  vi.restoreAllMocks();
});

describe("ContentUpdateBanner - visibility", () => {
  it("renders the banner when documentUpdateAvailable is true", () => {
    useAppStore.setState({ documentUpdateAvailable: true });
    render(<ContentUpdateBanner />);
    expect(
      screen.getByText(
        "The shared document has been updated. Refresh to continue reviewing.",
      ),
    ).toBeInTheDocument();
  });

  it("warns about unsent comments when local peer comment work exists", () => {
    useAppStore.setState({
      documentUpdateAvailable: true,
      peerDraftCommentOpen: true,
    });
    render(<ContentUpdateBanner />);
    expect(
      screen.getByText(
        "The shared document changed. Refresh to continue reviewing. Unsent comments will be discarded.",
      ),
    ).toBeInTheDocument();
  });

  it("does not render when documentUpdateAvailable is false", () => {
    useAppStore.setState({ documentUpdateAvailable: false });
    const { container } = render(<ContentUpdateBanner />);
    expect(container.firstChild).toBeNull();
  });
});

describe("ContentUpdateBanner - Refresh button", () => {
  it("calls loadSharedContent when Refresh is clicked", async () => {
    const loadSharedContent = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({ documentUpdateAvailable: true, loadSharedContent });
    render(<ContentUpdateBanner />);
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(loadSharedContent).toHaveBeenCalledWith({
      discardUnsubmitted: true,
    });
  });

  it("calls dismissDocumentUpdate after loadSharedContent resolves", async () => {
    const dismissDocumentUpdate = vi.fn();
    const loadSharedContent = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({
      documentUpdateAvailable: true,
      dismissDocumentUpdate,
      loadSharedContent,
    });
    render(<ContentUpdateBanner />);
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await vi.waitFor(() => {
      expect(dismissDocumentUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it("does not dismiss when loadSharedContent fails", async () => {
    const dismissDocumentUpdate = vi.fn();
    const loadSharedContent = vi
      .fn()
      .mockRejectedValue(new Error("network error"));
    useAppStore.setState({
      documentUpdateAvailable: true,
      dismissDocumentUpdate,
      loadSharedContent,
    });
    render(<ContentUpdateBanner />);
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await vi.waitFor(() => {
      expect(loadSharedContent).toHaveBeenCalledTimes(1);
    });
    expect(dismissDocumentUpdate).not.toHaveBeenCalled();
  });
  it("does not render a dismiss button", () => {
    useAppStore.setState({ documentUpdateAvailable: true });
    render(<ContentUpdateBanner />);
    expect(
      screen.queryByRole("button", { name: "Dismiss" }),
    ).not.toBeInTheDocument();
  });
});
