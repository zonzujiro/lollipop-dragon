import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/handleStore", () => ({
  saveHandle: vi.fn(),
  getHandle: vi.fn(),
  removeHandle: vi.fn(),
}));

vi.mock("../services/fileSystem", async () => {
  const actual = await vi.importActual<typeof import("../services/fileSystem")>(
    "../services/fileSystem",
  );
  return {
    ...actual,
    buildFileTree: vi.fn(),
    readFile: vi.fn(),
  };
});

import { useAppStore } from "../store";
import { getActiveTab } from "../store/selectors";
import { getHandle } from "../services/handleStore";
import { buildFileTree, readFile } from "../services/fileSystem";
import { createDefaultTab } from "../types/tab";
import { resetTestStore } from "./testHelpers";
import type { FileTreeNode } from "../types/fileTree";

beforeEach(() => {
  resetTestStore();
  vi.clearAllMocks();
});

describe("store.switchTab", () => {
  it("restores a persisted folder tab when it becomes active", async () => {
    const openTab = createDefaultTab({
      id: "open-tab",
      label: "draft.md",
      fileName: "draft.md",
      rawContent: "# Draft",
    });
    const restoredTab = createDefaultTab({
      id: "restored-tab",
      label: "project",
      directoryName: "project",
      activeFilePath: "docs/readme.md",
      rawContent: "# Persisted content",
      sidebarOpen: true,
    });

    useAppStore.setState({
      tabs: [openTab, restoredTab],
      activeTabId: openTab.id,
    });

    const fileHandle = {
      kind: "file",
      name: "readme.md",
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue("# Restored content"),
      }),
    };
    const directoryHandle = {
      kind: "directory",
      name: "project",
      queryPermission: vi.fn().mockResolvedValue("prompt"),
      requestPermission: vi.fn().mockResolvedValue("granted"),
    };
    const tree: FileTreeNode[] = [
      {
        kind: "directory",
        name: "docs",
        path: "docs",
        children: [
          {
            kind: "file",
            name: "readme.md",
            path: "docs/readme.md",
            handle: fileHandle,
          },
        ],
      },
    ];

    vi.mocked(getHandle).mockResolvedValue(directoryHandle);
    vi.mocked(buildFileTree).mockResolvedValue(tree);
    vi.mocked(readFile).mockResolvedValue("# Restored content");

    await useAppStore.getState().switchTab(restoredTab.id);

    const activeTab = getActiveTab(useAppStore.getState());
    expect(activeTab?.id).toBe(restoredTab.id);
    expect(activeTab?.directoryHandle).toBe(directoryHandle);
    expect(activeTab?.fileTree).toEqual(tree);
    expect(activeTab?.fileHandle).toBe(fileHandle);
    expect(activeTab?.fileName).toBe("readme.md");
    expect(activeTab?.rawContent).toBe("# Restored content");
    expect(directoryHandle.requestPermission).toHaveBeenCalledWith({
      mode: "read",
    });
  });
});
