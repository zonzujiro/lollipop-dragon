import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../../store";
import { getActiveTab } from "../../../store/selectors";
import { resetTestStore, setTestState } from "../../../testing/testHelpers";

function createWritableStub() {
  const writer = {
    closed: Promise.resolve(undefined),
    desiredSize: 0,
    ready: Promise.resolve(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    releaseLock: vi.fn(),
    write: vi.fn().mockResolvedValue(undefined),
  };
  return {
    locked: false,
    abort: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    getWriter: vi.fn().mockReturnValue(writer),
    seek: vi.fn().mockResolvedValue(undefined),
    truncate: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
  };
}

function createFileHandleStub(writable: {
  write: (...args: unknown[]) => unknown;
  close: () => unknown;
}) {
  return {
    kind: "file",
    name: "test.md",
    createWritable: vi.fn().mockResolvedValue(writable),
    getFile: vi.fn().mockResolvedValue(new File([""], "test.md")),
    isSameEntry: vi.fn().mockResolvedValue(false),
    queryPermission: vi.fn().mockResolvedValue("granted"),
    requestPermission: vi.fn().mockResolvedValue("granted"),
  } satisfies FileSystemFileHandle;
}

beforeEach(() => {
  resetTestStore();
  setTestState({
    fileHandle: null,
    rawContent: "",
    comments: [],
    writeAllowed: true,
  });
  vi.restoreAllMocks();
});

describe("store.addComment", () => {
  it("inserts the comment and updates rawContent", async () => {
    const mockWritable = createWritableStub();
    setTestState({
      fileHandle: createFileHandleStub(mockWritable),
      rawContent: "First paragraph.\n\nSecond paragraph.",
    });

    await useAppStore.getState().addComment(0, "note", "my note");

    const expectedContent =
      "First paragraph.{>>my note<<}\n\nSecond paragraph.";
    expect(mockWritable.write).toHaveBeenCalledWith(expectedContent);
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.rawContent).toBe(expectedContent);
  });

  it("adds a typed comment with its prefix", async () => {
    const mockWritable = createWritableStub();
    setTestState({
      fileHandle: createFileHandleStub(mockWritable),
      rawContent: "Para.",
    });

    await useAppStore.getState().addComment(0, "fix", "fix it");

    expect(mockWritable.write).toHaveBeenCalledWith("Para.{>>fix: fix it<<}");
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.rawContent).toBe("Para.{>>fix: fix it<<}");
  });

  it("round-trips a mid-sentence range comment through CriticMarkup", async () => {
    const mockWritable = createWritableStub();
    setTestState({
      fileHandle: createFileHandleStub(mockWritable),
      rawContent: "Read this exact sentence carefully.",
    });

    await useAppStore.getState().addComment(0, "fix", "Tighten it.", {
      quote: "this exact sentence",
      occurrence: 1,
      start: 5,
      end: 24,
    });

    const expectedContent =
      "Read {==this exact sentence==}{>>fix: Tighten it.<<} carefully.";
    expect(mockWritable.write).toHaveBeenCalledWith(expectedContent);
    expect(getActiveTab(useAppStore.getState())?.rawContent).toBe(
      expectedContent,
    );
  });

  it("writes a whole-line fence comment after the closing fence", async () => {
    const mockWritable = createWritableStub();
    const fence = "```ts\nconst value = 1;\n```";
    setTestState({
      fileHandle: createFileHandleStub(mockWritable),
      rawContent: fence,
    });

    await useAppStore.getState().addComment(0, "fix", "Rename value.", {
      quote: "const value = 1;",
      occurrence: 1,
      start: 0,
      end: 16,
    });

    const expectedContent = `${fence}\n{>>fix: Rename value. @@ "const value = 1;"<<}`;
    expect(mockWritable.write).toHaveBeenCalledWith(expectedContent);
    expect(getActiveTab(useAppStore.getState())?.rawContent).toBe(
      expectedContent,
    );
  });

  it("inserts comments into the body when markdown starts with metadata", async () => {
    const mockWritable = createWritableStub();
    const rawContent = [
      "---",
      "id: DEC-example",
      "participants:",
      "  - Ivan",
      "  - Codex",
      "---",
      "# Decision",
      "",
      "Body paragraph.",
    ].join("\n");
    setTestState({
      fileHandle: createFileHandleStub(mockWritable),
      rawContent,
    });

    await useAppStore.getState().addComment(0, "note", "body note");

    const expectedContent = rawContent.replace(
      "# Decision",
      "# Decision{>>body note<<}",
    );
    expect(mockWritable.write).toHaveBeenCalledWith(expectedContent);
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.rawContent).toBe(expectedContent);
  });

  it("sets writeAllowed to false on NotAllowedError", async () => {
    const error = Object.assign(new Error("no permission"), {
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
      rawContent: "Hello.",
    });

    await useAppStore.getState().addComment(0, "note", "hi");

    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.writeAllowed).toBe(false);
    expect(tab?.rawContent).toBe("Hello.");
  });

  it("sets writeAllowed to false on SecurityError", async () => {
    const error = Object.assign(new Error("security"), {
      name: "SecurityError",
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
      rawContent: "Hello.",
    });

    await useAppStore.getState().addComment(0, "note", "hi");

    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.writeAllowed).toBe(false);
  });

  it("does nothing when fileHandle is null", async () => {
    setTestState({ fileHandle: null, rawContent: "Hello." });
    await useAppStore.getState().addComment(0, "note", "hi");
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.rawContent).toBe("Hello.");
  });
});
