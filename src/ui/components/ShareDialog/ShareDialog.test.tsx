import { render, screen, waitFor } from "@testing-library/react";
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
  it("shows the document label in the title", () => {
    render(<ShareDialog onClose={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: /Share "readme.md"/ }),
    ).toBeInTheDocument();
  });

  it("uses directoryName as label when set", () => {
    setTestState({ directoryName: "my-project", fileName: "index.md" });
    render(<ShareDialog onClose={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: /Share "my-project"/ }),
    ).toBeInTheDocument();
  });

  it("shows TTL select with default 7 days", () => {
    render(<ShareDialog onClose={vi.fn()} />);
    const select = screen.getByRole("combobox");
    expect(select).toHaveValue("604800");
  });

  it("shows all TTL options", () => {
    render(<ShareDialog onClose={vi.fn()} />);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent("1 day");
    expect(options[1]).toHaveTextContent("7 days");
    expect(options[2]).toHaveTextContent("30 days");
  });

  it("shows Generate link button", () => {
    render(<ShareDialog onClose={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Generate link" }),
    ).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ShareDialog onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when × close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ShareDialog onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("ShareDialog - share flow", () => {
  it("calls shareContent with selected TTL and shows link", async () => {
    const shareContent = vi
      .fn()
      .mockResolvedValue("https://example.com/#share=abc&key=xyz");
    useAppStore.setState({ shareContent });
    const user = userEvent.setup();
    render(<ShareDialog onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Generate link" }));
    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: "Shareable link" }),
      ).toHaveValue("https://example.com/#share=abc&key=xyz");
    });
    expect(shareContent).toHaveBeenCalledWith({ ttl: 604800 });
  });

  it("shows error message when shareContent throws", async () => {
    const shareContent = vi.fn().mockRejectedValue(new Error("Worker offline"));
    useAppStore.setState({ shareContent });
    const user = userEvent.setup();
    render(<ShareDialog onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Generate link" }));
    await waitFor(() => {
      expect(screen.getByText("Worker offline")).toBeInTheDocument();
    });
  });

  it("shows Encrypting... while loading", async () => {
    let resolveShare: (url: string) => void = () => undefined;
    const shareContent = vi.fn().mockReturnValue(
      new Promise<string>((resolve) => {
        resolveShare = resolve;
      }),
    );
    useAppStore.setState({ shareContent });
    const user = userEvent.setup();
    render(<ShareDialog onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Generate link" }));
    expect(
      screen.getByRole("button", { name: /Encrypting/ }),
    ).toBeInTheDocument();
    resolveShare("https://example.com/#share=abc&key=xyz");
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Encrypting/ }),
      ).not.toBeInTheDocument();
    });
  });

  it("copies link to clipboard and closes dialog on Copy button click", async () => {
    const shareContent = vi
      .fn()
      .mockResolvedValue("https://example.com/#share=abc&key=xyz");
    useAppStore.setState({ shareContent });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ShareDialog onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Generate link" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "https://example.com/#share=abc&key=xyz",
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(useAppStore.getState().toast).toBe("Link copied to clipboard");
  });
});
