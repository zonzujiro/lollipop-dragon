import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../config", () => ({
  WORKER_URL: "https://mock-worker.test",
}));

import { Header } from "./index";
import { useAppStore } from "../../../store";
import {
  makeComment,
  resetTestStore,
  setTestState,
} from "../../../testing/testHelpers";

beforeEach(() => {
  resetTestStore();
  vi.restoreAllMocks();
});

describe("Header share buttons", () => {
  it.each([false, true])(
    "shows the app logo when peer mode is %s",
    (peerMode) => {
      setTestState({ fileName: "readme.md" });
      render(<Header peerMode={peerMode} />);

      expect(
        screen.getByRole("img", { name: "Lollipop Dragon" }),
      ).toBeInTheDocument();
    },
  );

  describe("visibility", () => {
    it("shows Share when a file is open and handler is provided", () => {
      setTestState({ fileName: "readme.md" });
      render(<Header onShareFile={vi.fn()} onShareFolder={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    });

    it("shows the unified Share action for a folder", () => {
      setTestState({
        fileName: null,
        directoryName: "my-folder",
        fileTree: [{ kind: "file", name: "a.md", path: "a.md" }],
      });
      render(<Header onShareFile={vi.fn()} onShareFolder={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    });

    it("uses one Share action when a folder is open", () => {
      setTestState({
        directoryName: "my-folder",
        fileTree: [{ kind: "file", name: "a.md", path: "a.md" }],
      });
      render(<Header onShareFile={vi.fn()} onShareFolder={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    });

    it("does not render duplicate scope-specific actions", () => {
      setTestState({ fileName: "readme.md", fileTree: [] });
      render(<Header onShareFile={vi.fn()} onShareFolder={vi.fn()} />);
      expect(
        screen.queryByRole("button", { name: "Share folder" }),
      ).not.toBeInTheDocument();
    });

    it("hides both buttons in peer mode", () => {
      setTestState({
        fileName: "readme.md",
        fileTree: [{ kind: "file", name: "a.md", path: "a.md" }],
      });
      render(<Header peerMode onShareFile={vi.fn()} onShareFolder={vi.fn()} />);
      expect(
        screen.queryByRole("button", { name: "Share" }),
      ).not.toBeInTheDocument();
    });

    it("hides buttons when handlers are not provided", () => {
      setTestState({
        fileName: "readme.md",
        directoryName: "my-folder",
        fileTree: [{ kind: "file", name: "a.md", path: "a.md" }],
      });
      render(<Header />);
      expect(
        screen.queryByRole("button", { name: "Share" }),
      ).not.toBeInTheDocument();
    });

    it("guards review mutations while restore access is required", async () => {
      const user = userEvent.setup();
      const onShareFile = vi.fn();
      setTestState({
        fileName: "readme.md",
        rawContent: "# Persisted",
        restoreError: 'Live access to "readme.md" is unavailable.',
      });

      render(<Header onShareFile={onShareFile} onShareFolder={vi.fn()} />);

      const shareButton = screen.getByRole("button", { name: "Share" });
      expect(shareButton).toHaveAttribute("aria-disabled", "true");
      expect(
        screen.getByRole("button", { name: "Open comments panel" }),
      ).toBeEnabled();

      await user.click(shareButton);
      expect(onShareFile).not.toHaveBeenCalled();
      expect(useAppStore.getState().toast).toBe(
        "Share management resumes once folder access is restored",
      );

      await user.click(
        screen.getByRole("button", { name: "Open comments panel" }),
      );
      expect(useAppStore.getState().tabs[0]?.commentPanelOpen).toBe(true);
    });
  });

  describe("click handlers", () => {
    it("calls onShareFile when Share is clicked for a file", async () => {
      const user = userEvent.setup();
      const onShareFile = vi.fn();
      setTestState({ fileName: "readme.md" });
      render(<Header onShareFile={onShareFile} onShareFolder={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "Share" }));
      expect(onShareFile).toHaveBeenCalledOnce();
    });

    it("calls onShareFolder when Share is clicked for a folder", async () => {
      const user = userEvent.setup();
      const onShareFolder = vi.fn();
      setTestState({
        directoryName: "my-folder",
        fileTree: [{ kind: "file", name: "a.md", path: "a.md" }],
      });
      render(<Header onShareFile={vi.fn()} onShareFolder={onShareFolder} />);

      await user.click(screen.getByRole("button", { name: "Share" }));
      expect(onShareFolder).toHaveBeenCalledOnce();
    });
  });
});

describe("Header review actions", () => {
  it("copies one review prompt with comment and thread instructions", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    setTestState({
      fileName: "spec.md",
      activeFilePath: "docs/spec.md",
      comments: [
        makeComment({
          id: "fix-root",
          type: "fix",
          text: "Fix the intro",
        }),
        makeComment({
          id: "question-root",
          type: "question",
          text: "Why is this here?",
          thread: {
            commentId: "mr-question-custom",
            threadId: "mr-question-custom",
          },
        }),
      ],
    });

    render(<Header />);
    await user.click(screen.getByRole("button", { name: "Copy prompt" }));

    expect(writeText).toHaveBeenCalledOnce();
    const prompt = writeText.mock.calls[0]?.[0];
    expect(prompt).toContain("Review docs/spec.md");
    expect(prompt).toContain("Work only in docs/spec.md");
    expect(prompt).not.toContain("fix-root");
    expect(prompt).not.toContain("Fix the intro");
    expect(prompt).not.toContain("mr-question-custom");
    expect(prompt).toContain("Question thread replies");
    expect(
      screen.queryByRole("button", { name: "Copy answer prompt" }),
    ).not.toBeInTheDocument();
  });

  it("copies the review prompt when only question threads are present", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    setTestState({
      fileName: "spec.md",
      comments: [
        makeComment({
          id: "question-root",
          type: "question",
          text: "Why is this here?",
          thread: {
            commentId: "mr-question-custom",
            threadId: "mr-question-custom",
          },
        }),
      ],
    });

    render(<Header />);
    await user.click(screen.getByRole("button", { name: "Copy prompt" }));

    expect(writeText).toHaveBeenCalledOnce();
    const prompt = writeText.mock.calls[0]?.[0];
    expect(prompt).toContain("Review spec.md");
    expect(prompt).toContain("Answer its MarkReview question threads");
    expect(prompt).not.toContain("mr-question-custom");
  });
});
