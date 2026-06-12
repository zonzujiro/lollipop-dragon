import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./tauriBridge", () => ({
  readTauriDirectoryTree: vi.fn(),
  readTauriTextFile: vi.fn(),
  writeTauriTextFile: vi.fn(),
}));

import {
  readTauriDirectoryTree,
  readTauriTextFile,
  writeTauriTextFile,
} from "./tauriBridge";
import { desktopWorkspaceRuntime } from "./desktopWorkspaceRuntime";
import type { NativeWorkspaceFileTarget } from "./workspace";

function createFileHandle(name: string): FileSystemFileHandle {
  return {
    kind: "file",
    name,
    createWritable: vi.fn(),
    getFile: vi.fn(),
    isSameEntry: vi.fn(),
    queryPermission: vi.fn(),
    requestPermission: vi.fn(),
  };
}

function createDirectoryHandle(name: string): FileSystemDirectoryHandle {
  return {
    kind: "directory",
    name,
    getDirectoryHandle: vi.fn(),
    getFileHandle: vi.fn(),
    removeEntry: vi.fn(),
    resolve: vi.fn(),
    entries: vi.fn(),
    keys: vi.fn(),
    values: vi.fn(),
    isSameEntry: vi.fn(),
    queryPermission: vi.fn(),
    requestPermission: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("desktopWorkspaceRuntime", () => {
  it("delegates native file reads and writes to Tauri commands", async () => {
    const target: NativeWorkspaceFileTarget = {
      kind: "native_file",
      path: "/tmp/project/notes.md",
      name: "notes.md",
    };
    vi.mocked(readTauriTextFile).mockResolvedValue("# Notes");
    vi.mocked(writeTauriTextFile).mockResolvedValue(null);

    await expect(desktopWorkspaceRuntime.readFile(target)).resolves.toBe(
      "# Notes",
    );
    await desktopWorkspaceRuntime.writeFile(target, "# Updated");

    expect(readTauriTextFile).toHaveBeenCalledWith(target);
    expect(writeTauriTextFile).toHaveBeenCalledWith(target, "# Updated");
  });

  it("maps native directory trees to live file tree nodes", async () => {
    vi.mocked(readTauriDirectoryTree).mockResolvedValue([
      {
        kind: "directory",
        name: "docs",
        path: "docs",
        children: [
          {
            kind: "file",
            name: "intro.md",
            path: "docs/intro.md",
          },
        ],
      },
    ]);

    await expect(
      desktopWorkspaceRuntime.buildFileTree({
        kind: "native_directory",
        path: "/tmp/project",
        name: "project",
      }),
    ).resolves.toEqual([
      {
        kind: "directory",
        name: "docs",
        path: "docs",
        children: [
          {
            kind: "file",
            name: "intro.md",
            path: "docs/intro.md",
            handle: {
              kind: "native_file",
              name: "intro.md",
              path: "/tmp/project/docs/intro.md",
            },
          },
        ],
      },
    ]);
  });

  it("rejects browser handles in the desktop runtime", async () => {
    await expect(
      desktopWorkspaceRuntime.readFile(createFileHandle("notes.md")),
    ).rejects.toThrow(
      "Browser file handles are unavailable in the desktop runtime",
    );

    await expect(
      desktopWorkspaceRuntime.buildFileTree(createDirectoryHandle("docs")),
    ).rejects.toThrow(
      "Browser directory handles are unavailable in the desktop runtime",
    );
  });
});
