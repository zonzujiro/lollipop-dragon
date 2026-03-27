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
    expect(activeTab?.restoreError).toBeNull();
  });

  it("sets restoreError when buildFileTree throws NotFoundError", async () => {
    const openTab = createDefaultTab({
      id: "open-tab",
      label: "draft.md",
      fileName: "draft.md",
    });
    const brokenTab = createDefaultTab({
      id: "broken-tab",
      label: "deleted-project",
      directoryName: "deleted-project",
      sidebarOpen: true,
    });

    useAppStore.setState({
      tabs: [openTab, brokenTab],
      activeTabId: openTab.id,
    });

    const directoryHandle = {
      kind: "directory",
      name: "deleted-project",
      queryPermission: vi.fn().mockResolvedValue("prompt"),
      requestPermission: vi.fn().mockResolvedValue("granted"),
    };

    vi.mocked(getHandle).mockResolvedValue(directoryHandle);
    vi.mocked(buildFileTree).mockRejectedValue(
      new DOMException(
        "A requested file or directory could not be found",
        "NotFoundError",
      ),
    );

    await useAppStore.getState().switchTab(brokenTab.id);

    const tab = useAppStore.getState().tabs.find((t) => t.id === "broken-tab");
    expect(tab?.restoreError).toContain("deleted-project");
    expect(tab?.restoreError).toContain("could not be accessed");
    expect(tab?.directoryHandle).toBeNull();
  });
});

describe("store.restoreTabs", () => {
  it("sets restoreError on file tab when handle is missing from IndexedDB", async () => {
    const fileTab = createDefaultTab({
      id: "file-tab",
      label: "notes.md",
      fileName: "notes.md",
      rawContent: "# Stale content",
    });

    useAppStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    vi.mocked(getHandle).mockResolvedValue(null);

    await useAppStore.getState().restoreTabs();

    const tab = useAppStore.getState().tabs.find((t) => t.id === "file-tab");
    expect(tab?.restoreError).toContain("notes.md");
    expect(tab?.restoreError).toContain("could not be accessed");
  });

  it("sets restoreError on file tab when handle throws", async () => {
    const fileTab = createDefaultTab({
      id: "file-tab",
      label: "gone.md",
      fileName: "gone.md",
    });

    useAppStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    const handle = {
      kind: "file",
      name: "gone.md",
      queryPermission: vi
        .fn()
        .mockRejectedValue(
          new DOMException(
            "A requested file or directory could not be found",
            "NotFoundError",
          ),
        ),
    };
    vi.mocked(getHandle).mockResolvedValue(handle);

    await useAppStore.getState().restoreTabs();

    const tab = useAppStore.getState().tabs.find((t) => t.id === "file-tab");
    expect(tab?.restoreError).toContain("gone.md");
  });

  it("clears restoreError on successful file tab restore", async () => {
    const fileTab = createDefaultTab({
      id: "file-tab",
      label: "notes.md",
      fileName: "notes.md",
      restoreError: "Previous error",
    });

    useAppStore.setState({
      tabs: [fileTab],
      activeTabId: fileTab.id,
    });

    const handle = {
      kind: "file",
      name: "notes.md",
      queryPermission: vi.fn().mockResolvedValue("granted"),
    };
    vi.mocked(getHandle).mockResolvedValue(handle);
    vi.mocked(readFile).mockResolvedValue("# Fresh content");

    await useAppStore.getState().restoreTabs();

    const tab = useAppStore.getState().tabs.find((t) => t.id === "file-tab");
    expect(tab?.restoreError).toBeNull();
    expect(tab?.rawContent).toBe("# Fresh content");
  });
});
