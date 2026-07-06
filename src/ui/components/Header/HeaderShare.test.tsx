import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../config", () => ({
  WORKER_URL: "https://mock-worker.test",
}));

import { Header } from "./index";
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
  describe("visibility", () => {
    it("shows Share file when a file is open and handler is provided", () => {
      setTestState({ fileName: "readme.md" });
      render(<Header onShareFile={vi.fn()} onShareFolder={vi.fn()} />);
      expect(
        screen.getByRole("button", { name: "Share file" }),
      ).toBeInTheDocument();
    });

    it("hides Share file when no file is open", () => {
      setTestState({
        fileName: null,
        directoryName: "my-folder",
        fileTree: [{ kind: "file", name: "a.md", path: "a.md" }],
      });
      render(<Header onShareFile={vi.fn()} onShareFolder={vi.fn()} />);
      expect(
        screen.queryByRole("button", { name: "Share file" }),
      ).not.toBeInTheDocument();
    });

    it("shows Share folder when a folder is open and handler is provided", () => {
      setTestState({
        directoryName: "my-folder",
        fileTree: [{ kind: "file", name: "a.md", path: "a.md" }],
      });
      render(<Header onShareFile={vi.fn()} onShareFolder={vi.fn()} />);
      expect(
        screen.getByRole("button", { name: "Share folder" }),
      ).toBeInTheDocument();
    });

    it("hides Share folder when no folder is open", () => {
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
        screen.queryByRole("button", { name: "Share file" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Share folder" }),
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
        screen.queryByRole("button", { name: "Share file" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Share folder" }),
      ).not.toBeInTheDocument();
    });

    it("disables review controls while restore access is required", () => {
      setTestState({
        fileName: "readme.md",
        rawContent: "# Persisted",
        restoreError: 'Live access to "readme.md" is unavailable.',
      });

      render(<Header onShareFile={vi.fn()} onShareFolder={vi.fn()} />);

      expect(screen.getByRole("button", { name: "Share file" })).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Shared links" }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Open comments panel" }),
      ).toBeDisabled();
    });
  });

  describe("click handlers", () => {
    it("calls onShareFile when Share file button is clicked", async () => {
      const user = userEvent.setup();
      const onShareFile = vi.fn();
      setTestState({ fileName: "readme.md" });
      render(<Header onShareFile={onShareFile} onShareFolder={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "Share file" }));
      expect(onShareFile).toHaveBeenCalledOnce();
    });

    it("calls onShareFolder when Share folder button is clicked", async () => {
      const user = userEvent.setup();
      const onShareFolder = vi.fn();
      setTestState({
        directoryName: "my-folder",
        fileTree: [{ kind: "file", name: "a.md", path: "a.md" }],
      });
      render(<Header onShareFile={vi.fn()} onShareFolder={onShareFolder} />);

      await user.click(screen.getByRole("button", { name: "Share folder" }));
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
            commentId: "mr-question-1",
            threadId: "mr-question-1",
          },
        }),
      ],
    });

    render(<Header />);
    await user.click(
      screen.getByRole("button", { name: "Copy review prompt" }),
    );

    expect(writeText).toHaveBeenCalledOnce();
    const prompt = writeText.mock.calls[0]?.[0];
    expect(prompt).toContain("Review docs/spec.md");
    expect(prompt).toContain("Work only in docs/spec.md");
    expect(prompt).toContain("- fix-root (fix): Fix the intro");
    expect(prompt).toContain("- mr-question-1");
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
            commentId: "mr-question-1",
            threadId: "mr-question-1",
          },
        }),
      ],
    });

    render(<Header />);
    await user.click(
      screen.getByRole("button", { name: "Copy review prompt" }),
    );

    expect(writeText).toHaveBeenCalledOnce();
    const prompt = writeText.mock.calls[0]?.[0];
    expect(prompt).toContain("Review spec.md");
    expect(prompt).toContain("Answer these MarkReview question threads");
    expect(prompt).toContain("- mr-question-1");
  });
});
