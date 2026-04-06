import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config", () => ({
  WORKER_URL: "https://mock-worker.test",
}));

import { Header } from "./index";
import { resetTestStore, setTestState } from "../../test/testHelpers";

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
