import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShareDialog } from "./index";
import { useAppStore } from "../../../store";
import { resetTestStore, setTestState } from "../../../testing/testHelpers";

beforeEach(() => {
  resetTestStore();
  setTestState({
    fileName: "readme.md",
    directoryName: null,
  });
  useAppStore.setState({ shareContent: vi.fn() });
  vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
});

describe("ShareDialog - initial render", () => {
  it("uses the redesign review title and explanation", () => {
    render(<ShareDialog onClose={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "Share for review" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Reviewers only need the link — no account, no install/),
    ).toBeInTheDocument();
  });

  it("shows the directory scope and file count when a folder is open", () => {
    setTestState({ directoryName: "my-project", fileName: "index.md" });
    render(<ShareDialog onClose={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /Whole folder · 0 files/ }),
    ).toBeInTheDocument();
  });

  it("shows 7 days as the default expiry tab", () => {
    render(<ShareDialog onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows all expiry tabs and no access-level control", () => {
    render(<ShareDialog onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "1 day" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7 days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 days" })).toBeInTheDocument();
    expect(screen.queryByText("Reviewers can")).not.toBeInTheDocument();
  });

  it("pre-generates the link without uploading content", async () => {
    const shareContent = vi.fn();
    useAppStore.setState({ shareContent });
    render(<ShareDialog onClose={vi.fn()} />);
    expect(await screen.findByLabelText("Shareable link")).toHaveTextContent(
      /#s=/,
    );
    expect(
      screen.getByRole("button", { name: "Copy link" }),
    ).toBeInTheDocument();
    expect(shareContent).not.toHaveBeenCalled();
  });

  it("truncates the displayed URL", async () => {
    render(<ShareDialog onClose={vi.fn()} />);

    expect(await screen.findByLabelText("Shareable link")).toHaveTextContent(
      "…",
    );
  });

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    render(<ShareDialog onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when × close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ShareDialog onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("reuses an existing root-folder share for current-folder scope", () => {
    setTestState({
      directoryName: "my-project",
      fileName: "readme.md",
      shares: [
        {
          docId: "doc-1",
          hostSecret: "secret",
          label: "my-project",
          createdAt: "2026-04-01T00:00:00.000Z",
          expiresAt: "2099-04-01T00:00:00.000Z",
          pendingCommentCount: 0,
          keyB64: "abc123",
          fileCount: 1,
          sharedPaths: ["readme.md"],
        },
      ],
    });

    render(
      <ShareDialog
        onClose={vi.fn()}
        scope={{
          kind: "current-folder",
          label: "my-project",
          entityPath: "",
        }}
      />,
    );

    expect(
      screen.getByText("Encrypted link — key never leaves the URL"),
    ).toBeInTheDocument();
  });
});

describe("ShareDialog - share flow", () => {
  it("uploads with the selected expiry when Copy link is clicked", async () => {
    const shareContent = vi
      .fn()
      .mockResolvedValue("https://example.com/#share=abc&key=xyz");
    useAppStore.setState({ shareContent });
    const user = userEvent.setup();
    render(<ShareDialog onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "30 days" }));
    await user.click(await screen.findByRole("button", { name: "Copy link" }));
    expect(shareContent).toHaveBeenCalledWith(
      expect.objectContaining({
        ttl: 2592000,
        label: "readme.md",
        nodes: [],
        preparedIdentity: expect.any(Object),
      }),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "https://example.com/#share=abc&key=xyz",
    );
  });

  it("shares the current folder without materializing subtree nodes", async () => {
    const shareContent = vi
      .fn()
      .mockResolvedValue("https://example.com/#share=abc&key=xyz");
    useAppStore.setState({ shareContent });
    setTestState({
      directoryName: "my-project",
      fileName: "readme.md",
      activeFilePath: "readme.md",
    });
    const user = userEvent.setup();

    render(
      <ShareDialog
        onClose={vi.fn()}
        scope={{
          kind: "current-folder",
          label: "my-project",
          entityPath: "",
        }}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Copy link" }));

    await waitFor(() => {
      expect(shareContent).toHaveBeenCalledWith(
        expect.objectContaining({
          ttl: 604800,
          label: "my-project",
          preparedIdentity: expect.any(Object),
        }),
      );
    });
  });

  it("keeps explicit file-share behavior for the header file action", async () => {
    const shareContent = vi
      .fn()
      .mockResolvedValue("https://example.com/#share=abc&key=xyz");
    useAppStore.setState({ shareContent });
    setTestState({
      directoryName: "my-project",
      fileName: "readme.md",
      activeFilePath: "readme.md",
    });
    const user = userEvent.setup();

    render(
      <ShareDialog
        onClose={vi.fn()}
        scope={{
          kind: "current-file",
          label: "readme.md",
        }}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Copy link" }));

    await waitFor(() => {
      expect(shareContent).toHaveBeenCalledWith(
        expect.objectContaining({
          ttl: 604800,
          label: "readme.md",
          nodes: [],
          preparedIdentity: expect.any(Object),
        }),
      );
    });
  });

  it("shows error message when shareContent throws", async () => {
    const shareContent = vi.fn().mockRejectedValue(new Error("Worker offline"));
    useAppStore.setState({ shareContent });
    const user = userEvent.setup();
    render(<ShareDialog onClose={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Copy link" }));
    await waitFor(() => {
      expect(screen.getByText("Worker offline")).toBeInTheDocument();
    });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("shows the upload state on the clicked copy action", async () => {
    let resolveShare: (url: string) => void = () => undefined;
    const shareContent = vi.fn().mockReturnValue(
      new Promise<string>((resolve) => {
        resolveShare = resolve;
      }),
    );
    useAppStore.setState({ shareContent });
    const user = userEvent.setup();
    render(<ShareDialog onClose={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Copy link" }));
    expect(
      screen.getByRole("button", { name: "Encrypting & uploading…" }),
    ).toBeInTheDocument();
    resolveShare("https://example.com/#share=abc&key=xyz");
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Encrypting & uploading…" }),
      ).not.toBeInTheDocument();
    });
  });

  it("copies link to clipboard and keeps the management sheet open", async () => {
    const shareContent = vi
      .fn()
      .mockResolvedValue("https://example.com/#share=abc&key=xyz");
    useAppStore.setState({ shareContent });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ShareDialog onClose={onClose} />);
    await user.click(await screen.findByRole("button", { name: "Copy link" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "https://example.com/#share=abc&key=xyz",
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(useAppStore.getState().toast).toBe("Link copied to clipboard");
  });

  it("uploads once and copies a Slack-ready message", async () => {
    const shareContent = vi
      .fn()
      .mockResolvedValue("https://example.com/#share=abc&key=xyz");
    useAppStore.setState({ shareContent });
    const user = userEvent.setup();
    render(<ShareDialog onClose={vi.fn()} />);

    await user.click(
      await screen.findByRole("button", { name: "Copy as Slack message" }),
    );

    expect(shareContent).toHaveBeenCalledOnce();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "Please review readme.md: https://example.com/#share=abc&key=xyz",
    );
  });

  it("copies an existing active share without uploading it again", async () => {
    const shareContent = vi.fn();
    useAppStore.setState({ shareContent });
    setTestState({
      fileName: "readme.md",
      activeFilePath: "readme.md",
      shares: [
        {
          docId: "doc-1",
          hostSecret: "secret",
          label: "readme.md",
          createdAt: "2026-04-01T00:00:00.000Z",
          expiresAt: "2099-04-01T00:00:00.000Z",
          pendingCommentCount: 0,
          keyB64: "abc123",
          fileCount: 1,
          sharedPaths: ["readme.md"],
        },
      ],
    });
    const user = userEvent.setup();
    render(<ShareDialog onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(shareContent).not.toHaveBeenCalled();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("#s=abc123"),
    );
  });
});
