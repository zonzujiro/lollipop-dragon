import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../../store";
import { getActiveTab } from "../../../store/selectors";
import {
  makeComment,
  resetTestStore,
  setTestState,
} from "../../../test/testHelpers";

function createWritableStub(writeOk = true) {
  const write = writeOk
    ? vi.fn().mockResolvedValue(undefined)
    : vi.fn().mockRejectedValue(
        Object.assign(new Error("permission denied"), {
          name: "NotAllowedError",
        }),
      );
  const writer = {
    closed: Promise.resolve(undefined),
    desiredSize: 0,
    ready: Promise.resolve(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    releaseLock: vi.fn(),
    write,
  };
  return {
    locked: false,
    abort: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    getWriter: vi.fn().mockReturnValue(writer),
    seek: vi.fn().mockResolvedValue(undefined),
    truncate: vi.fn().mockResolvedValue(undefined),
    write,
  };
}

function makeHandle(writeOk = true) {
  const mockWritable = createWritableStub(writeOk);
  const handle = {
    kind: "file",
    name: "test.md",
    createWritable: vi.fn().mockResolvedValue(mockWritable),
    getFile: vi.fn().mockResolvedValue(new File([""], "test.md")),
    isSameEntry: vi.fn().mockResolvedValue(false),
    queryPermission: vi.fn().mockResolvedValue("granted"),
    requestPermission: vi.fn().mockResolvedValue("granted"),
  } satisfies FileSystemFileHandle;
  return { handle, mockWritable };
}

beforeEach(() => {
  resetTestStore();
  setTestState({
    fileHandle: null,
    rawContent: "",
    comments: [],
    writeAllowed: true,
    undoState: null,
    resolvedComments: [],
  });
  vi.restoreAllMocks();
});

describe("store.editComment", () => {
  it("writes updated markup and saves undoState", async () => {
    const { handle, mockWritable } = makeHandle();
    const comment = makeComment({ rawStart: 0, rawEnd: 15 });
    setTestState({
      fileHandle: handle,
      rawContent: "{>>original<<}",
      comments: [comment],
    });

    await useAppStore.getState().editComment("0", "fix", "fix this");

    expect(mockWritable.write).toHaveBeenCalledWith("{>>fix: fix this<<}");
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.rawContent).toBe("{>>fix: fix this<<}");
    expect(tab?.undoState?.rawContent).toBe("{>>original<<}");
  });

  it("sets writeAllowed=false on permission error", async () => {
    const error = Object.assign(new Error("permission denied"), {
      name: "NotAllowedError",
    });
    setTestState({
      fileHandle: {
        kind: "file",
        name: "test.md",
        createWritable: vi.fn().mockRejectedValue(error),
        getFile: vi.fn().mockResolvedValue(new File([""], "test.md")),
        isSameEntry: vi.fn().mockResolvedValue(false),
        queryPermission: vi.fn().mockResolvedValue("granted"),
        requestPermission: vi.fn().mockResolvedValue("granted"),
      } satisfies FileSystemFileHandle,
      rawContent: "Hi.",
      comments: [makeComment()],
    });

    await useAppStore.getState().editComment("0", "note", "x");

    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.writeAllowed).toBe(false);
  });
});

describe("store.deleteComment", () => {
  it("removes comment markup, writes file, saves undoState", async () => {
    const { handle, mockWritable } = makeHandle();
    const comment = makeComment({
      rawStart: 5,
      rawEnd: 19,
      raw: "{>>original<<}",
    });
    const rawContent = "Hello{>>original<<}World";
    setTestState({
      fileHandle: handle,
      rawContent,
      comments: [comment],
    });

    await useAppStore.getState().deleteComment("0");

    expect(mockWritable.write).toHaveBeenCalledWith("HelloWorld");
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.rawContent).toBe("HelloWorld");
    expect(tab?.undoState?.rawContent).toBe(rawContent);
  });
});

describe("store.undo", () => {
  it("restores rawContent from undoState and clears it", async () => {
    const { handle, mockWritable } = makeHandle();
    setTestState({
      fileHandle: handle,
      rawContent: "new content",
      undoState: { rawContent: "original content" },
    });

    await useAppStore.getState().undo();

    expect(mockWritable.write).toHaveBeenCalledWith("original content");
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.rawContent).toBe("original content");
    expect(tab?.undoState).toBeNull();
  });

  it("does nothing when undoState is null", async () => {
    const { handle, mockWritable } = makeHandle();
    setTestState({ fileHandle: handle, undoState: null });

    await useAppStore.getState().undo();

    expect(mockWritable.write).not.toHaveBeenCalled();
  });
});

describe("store.clearUndo", () => {
  it("clears undoState", () => {
    setTestState({ undoState: { rawContent: "x" } });

    useAppStore.getState().clearUndo();

    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.undoState).toBeNull();
  });
});
