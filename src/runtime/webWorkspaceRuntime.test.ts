import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/fileSystem", () => ({
  buildFileTree: vi.fn(),
  openDirectory: vi.fn(),
  openFile: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

import {
  buildFileTree,
  openDirectory,
  openFile,
  readFile,
  writeFile,
} from "../services/fileSystem";
import { workspaceRuntime } from ".";

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

describe("workspaceRuntime", () => {
  it("delegates file operations to the web filesystem implementation", async () => {
    const fileHandle = createFileHandle("notes.md");
    vi.mocked(openFile).mockResolvedValue({
      handle: fileHandle,
      name: "notes.md",
    });
    vi.mocked(readFile).mockResolvedValue("# Notes");
    vi.mocked(writeFile).mockResolvedValue(undefined);

    await expect(workspaceRuntime.openFile()).resolves.toEqual({
      handle: fileHandle,
      name: "notes.md",
    });
    await expect(workspaceRuntime.readFile(fileHandle)).resolves.toBe(
      "# Notes",
    );
    await workspaceRuntime.writeFile(fileHandle, "# Updated");

    expect(openFile).toHaveBeenCalled();
    expect(readFile).toHaveBeenCalledWith(fileHandle);
    expect(writeFile).toHaveBeenCalledWith(fileHandle, "# Updated");
  });

  it("delegates directory operations to the web filesystem implementation", async () => {
    const directoryHandle = createDirectoryHandle("docs");
    const tree = [
      {
        kind: "file",
        name: "README.md",
        path: "README.md",
        handle: createFileHandle("README.md"),
      },
    ];
    vi.mocked(openDirectory).mockResolvedValue({
      handle: directoryHandle,
      name: "docs",
    });
    vi.mocked(buildFileTree).mockResolvedValue(tree);

    await expect(workspaceRuntime.openDirectory()).resolves.toEqual({
      handle: directoryHandle,
      name: "docs",
    });
    await expect(workspaceRuntime.buildFileTree(directoryHandle)).resolves.toBe(
      tree,
    );

    expect(openDirectory).toHaveBeenCalled();
    expect(buildFileTree).toHaveBeenCalledWith(directoryHandle);
  });
});
