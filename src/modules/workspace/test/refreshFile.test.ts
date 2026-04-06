import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../../store";
import { getActiveTab } from "../selectors";
import {
  makeComment,
  resetTestStore,
  setTestState,
} from "../../../testing/testHelpers";

function createFileHandleStub(readText: string) {
  return {
    kind: "file",
    name: "test.md",
    createWritable: vi.fn(),
    getFile: vi.fn().mockResolvedValue({
      text: vi.fn().mockResolvedValue(readText),
    }),
    isSameEntry: vi.fn().mockResolvedValue(false),
    queryPermission: vi.fn().mockResolvedValue("granted"),
    requestPermission: vi.fn().mockResolvedValue("granted"),
  } satisfies FileSystemFileHandle;
}

beforeEach(() => {
  resetTestStore();
  vi.restoreAllMocks();
});

describe("store.refreshFile", () => {
  it("reads file from disk and detects resolved comments", async () => {
    const existingComment = makeComment({
      raw: "{>>original<<}",
      rawStart: 0,
      rawEnd: 15,
    });
    setTestState({
      fileHandle: createFileHandleStub("New content without the comment."),
      rawContent: "{>>original<<}",
      comments: [existingComment],
    });

    await useAppStore.getState().refreshFile();

    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.rawContent).toBe("New content without the comment.");
    expect(tab?.resolvedComments).toHaveLength(1);
    expect(tab?.resolvedComments[0].raw).toBe("{>>original<<}");
  });

  it("keeps comment as non-resolved if still present in new content", async () => {
    const existingComment = makeComment({
      raw: "{>>original<<}",
      rawStart: 0,
      rawEnd: 15,
    });
    setTestState({
      fileHandle: createFileHandleStub("{>>original<<} still here."),
      rawContent: "{>>original<<}",
      comments: [existingComment],
    });

    await useAppStore.getState().refreshFile();

    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.resolvedComments).toHaveLength(0);
  });
});
