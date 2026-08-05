import { beforeEach, describe, it, expect, vi } from "vitest";
import { useAppStore } from "../../../store";
import { getActiveTab } from "../../../store/selectors";
import {
  setTestState,
  resetTestStore,
  makeShare,
  makePeerComment,
  makeTestFileHandle,
} from "../../../testing/testHelpers";
import { createDefaultTab } from "../../../types/tab";

beforeEach(() => {
  resetTestStore();
  setTestState({
    shares: [],
    pendingComments: {},
    shareKeys: {},
    fileName: null,
    activeFilePath: null,
    rawContent: "",
    fileHandle: null,
    comments: [],
    writeAllowed: true,
  });
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("store.dismissComment", () => {
  it("removes comment from pendingComments by id", () => {
    const comment = makePeerComment({ id: "cmt-1" });
    setTestState({
      pendingComments: { "doc-1": [comment, makePeerComment({ id: "cmt-2" })] },
      shares: [makeShare()],
    });
    useAppStore.getState().dismissComment("doc-1", "cmt-1");
    const tab = getActiveTab(useAppStore.getState());
    const pending = tab?.pendingComments["doc-1"];
    expect(pending).toHaveLength(1);
    expect(pending?.[0].id).toBe("cmt-2");
  });

  it("updates pendingCommentCount in shares", () => {
    setTestState({
      pendingComments: {
        "doc-1": [
          makePeerComment({ id: "cmt-1" }),
          makePeerComment({ id: "cmt-2" }),
        ],
      },
      shares: [makeShare({ pendingCommentCount: 2 })],
    });
    useAppStore.getState().dismissComment("doc-1", "cmt-1");
    const tab = getActiveTab(useAppStore.getState());
    const share = tab?.shares.find((s) => s.docId === "doc-1");
    expect(share?.pendingCommentCount).toBe(1);
  });

  it("handles dismissing from a non-existent docId gracefully", () => {
    setTestState({ pendingComments: {}, shares: [] });
    expect(() =>
      useAppStore.getState().dismissComment("doc-x", "cmt-1"),
    ).not.toThrow();
  });
});

describe("store.toggleSharedPanel", () => {
  it("toggles sharedPanelOpen from false to true", () => {
    setTestState({ sharedPanelOpen: false });
    useAppStore.getState().toggleSharedPanel();
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.sharedPanelOpen).toBe(true);
  });

  it("toggles sharedPanelOpen from true to false", () => {
    setTestState({ sharedPanelOpen: true });
    useAppStore.getState().toggleSharedPanel();
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.sharedPanelOpen).toBe(false);
  });
});

describe("store.mergeComment", () => {
  it("does nothing when no fileHandle", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    setTestState({
      fileHandle: null,
      rawContent: "# Hello\n",
      pendingComments: { "doc-1": [makePeerComment()] },
      shares: [makeShare()],
    });
    await useAppStore.getState().mergeComment("doc-1", makePeerComment());
    // No write should have occurred (no error either)
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.rawContent).toBe("# Hello\n");
    expect(errorLog).toHaveBeenCalledWith(
      "[mergeComment] no active tab or fileHandle",
      expect.any(Object),
    );
  });

  it("does nothing when comment.path !== currentPath", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const mockWritable = { write: vi.fn(), close: vi.fn() };
    const fileHandle = makeTestFileHandle({
      createWritable: vi.fn().mockResolvedValue(mockWritable),
    });
    setTestState({
      fileHandle,
      rawContent: "# Hello\n",
      fileName: "readme.md",
      activeFilePath: "readme.md",
      comments: [],
      pendingComments: { "doc-1": [makePeerComment({ path: "other.md" })] },
      shares: [makeShare()],
    });
    await useAppStore
      .getState()
      .mergeComment("doc-1", makePeerComment({ path: "other.md" }));
    expect(mockWritable.write).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      "[mergeComment] path mismatch",
      expect.any(Object),
    );
  });

  it("keeps an async merge owned by its original tab after the user switches tabs", async () => {
    let finishRead: ((content: string) => void) | null = null;
    const readContent = new Promise<string>((resolve) => {
      finishRead = resolve;
    });
    const writable = { write: vi.fn(), close: vi.fn() };
    const fileHandle = makeTestFileHandle({
      getFile: vi.fn().mockResolvedValue({ text: () => readContent }),
      createWritable: vi.fn().mockResolvedValue(writable),
    });
    const comment = makePeerComment({
      id: "cmt-owned",
      path: "a.md",
      blockRef: { blockIndex: 0, contentPreview: "Hello" },
    });
    const firstTab = createDefaultTab({
      id: "tab-a",
      workspaceId: "workspace-a",
      label: "a.md",
      fileHandle,
      fileName: "a.md",
      activeFilePath: "a.md",
      rawContent: "# Hello\n",
      shares: [makeShare()],
      pendingComments: { "doc-1": [comment] },
    });
    const secondTab = createDefaultTab({
      id: "tab-b",
      workspaceId: "workspace-b",
      label: "b.md",
      fileName: "b.md",
      rawContent: "# Other\n",
    });
    useAppStore.setState({
      tabs: [firstTab, secondTab],
      activeTabId: firstTab.id,
    });

    const mergePromise = useAppStore.getState().mergeComment("doc-1", comment);
    useAppStore.setState({ activeTabId: secondTab.id });
    if (!finishRead) {
      throw new Error("Expected deferred file read");
    }
    finishRead("# Hello\n");

    await expect(mergePromise).resolves.toBe(true);
    const state = useAppStore.getState();
    const updatedFirst = state.tabs.find((tab) => tab.id === firstTab.id);
    const unchangedSecond = state.tabs.find((tab) => tab.id === secondTab.id);
    expect(updatedFirst?.rawContent).toContain("mr-peer-cmt-owned");
    expect(updatedFirst?.pendingComments["doc-1"]).toBeUndefined();
    expect(unchangedSecond?.rawContent).toBe("# Other\n");
    expect(state.activeTabId).toBe(secondTab.id);
  });

  it("fails closed when the file changed after the comment was displayed", async () => {
    const writable = { write: vi.fn(), close: vi.fn() };
    const fileHandle = makeTestFileHandle({
      getFile: vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue("# Changed elsewhere\n"),
      }),
      createWritable: vi.fn().mockResolvedValue(writable),
    });
    const comment = makePeerComment({
      id: "cmt-stale",
      path: "test.md",
      blockRef: { blockIndex: 0, contentPreview: "Hello" },
    });
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    setTestState({
      fileHandle,
      fileName: "test.md",
      activeFilePath: "test.md",
      rawContent: "# Hello\n",
      shares: [makeShare()],
      pendingComments: { "doc-1": [comment] },
    });

    await expect(
      useAppStore.getState().mergeComment("doc-1", comment),
    ).resolves.toBe(false);

    expect(writable.write).not.toHaveBeenCalled();
    expect(
      getActiveTab(useAppStore.getState())?.pendingComments["doc-1"],
    ).toEqual([comment]);
    expect(warning).toHaveBeenCalledWith(
      "[mergeComment] document changed before merge",
      expect.any(Object),
    );
  });

  it("recovers a retry after the file write without inserting a duplicate", async () => {
    let diskContent = "# Hello\n";
    const writable = {
      write: vi.fn((content: string) => {
        diskContent = content;
      }),
      close: vi.fn(),
    };
    const fileHandle = makeTestFileHandle({
      getFile: vi.fn().mockImplementation(() =>
        Promise.resolve({
          text: () => Promise.resolve(diskContent),
        }),
      ),
      createWritable: vi.fn().mockResolvedValue(writable),
    });
    const comment = makePeerComment({
      id: "cmt-idempotent",
      path: "test.md",
      blockRef: { blockIndex: 0, contentPreview: "Hello" },
    });
    setTestState({
      fileHandle,
      fileName: "test.md",
      activeFilePath: "test.md",
      rawContent: diskContent,
      shares: [makeShare()],
      pendingComments: { "doc-1": [comment] },
    });

    await expect(
      useAppStore.getState().mergeComment("doc-1", comment),
    ).resolves.toBe(true);
    await expect(
      useAppStore.getState().mergeComment("doc-1", comment),
    ).resolves.toBe(true);

    expect(writable.write).toHaveBeenCalledOnce();
    expect(diskContent.match(/mr-peer-cmt-idempotent/g)).toHaveLength(2);
  });
});

describe("incoming comment persistence failures", () => {
  it("still displays a valid incoming comment when local storage is unavailable", () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    const comment = makePeerComment({ id: "cmt-visible" });
    setTestState({ shares: [makeShare()] });

    expect(() =>
      useAppStore.getState().addPendingComment("doc-1", comment),
    ).not.toThrow();

    expect(
      getActiveTab(useAppStore.getState())?.pendingComments["doc-1"],
    ).toEqual([comment]);
    expect(warning).toHaveBeenCalled();
  });

  it("keeps a dismissed comment visible when the resolve outbox cannot persist", () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const comment = makePeerComment({ id: "cmt-retry" });
    setTestState({
      shares: [makeShare()],
      pendingComments: { "doc-1": [comment] },
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });

    useAppStore.getState().dismissComment("doc-1", comment.id);

    expect(
      getActiveTab(useAppStore.getState())?.pendingComments["doc-1"],
    ).toEqual([comment]);
    expect(warning).toHaveBeenCalledWith(
      "[sharing] failed to persist resolve outbox:",
      expect.any(DOMException),
    );
  });

  it("keeps a dismissed comment visible when the resolve outbox cannot be read", () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const comment = makePeerComment({ id: "cmt-read-retry" });
    setTestState({
      shares: [makeShare()],
      pendingComments: { "doc-1": [comment] },
    });
    const originalGetItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
      key: string,
    ) {
      if (key === "markreview-resolve-outbox-v1") {
        throw new DOMException("storage unavailable", "SecurityError");
      }
      return originalGetItem.call(this, key);
    });

    useAppStore.getState().dismissComment("doc-1", comment.id);

    expect(
      getActiveTab(useAppStore.getState())?.pendingComments["doc-1"],
    ).toEqual([comment]);
    expect(warning).toHaveBeenCalledWith(
      "[sharing] failed to load resolve outbox:",
      expect.any(DOMException),
    );
  });
});

describe("store.revokeShare", () => {
  it("removes share from state and localStorage", async () => {
    // Mock storage to avoid network calls
    const share = makeShare();
    setTestState({
      shares: [share],
      pendingComments: { "doc-1": [makePeerComment()] },
      shareKeys: {},
    });
    // Since WORKER_URL is undefined in tests, storage is null — revokeShare just removes from state
    await useAppStore.getState().revokeShare("doc-1");
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.shares).toHaveLength(0);
    expect(tab?.pendingComments["doc-1"]).toBeUndefined();
  });

  it("does nothing when docId is not in shares", async () => {
    setTestState({ shares: [makeShare()] });
    await useAppStore.getState().revokeShare("doc-unknown");
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.shares).toHaveLength(1);
  });
});
