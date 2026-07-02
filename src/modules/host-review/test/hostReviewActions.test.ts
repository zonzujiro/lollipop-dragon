import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../../store";
import { getActiveTab } from "../../../store/selectors";
import {
  makeComment,
  resetTestStore,
  setTestState,
} from "../../../testing/testHelpers";

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

  it("removes a whole question thread when deleting the root question", async () => {
    const { handle, mockWritable } = makeHandle();
    const questionRaw =
      '{>>question: Why? [markreview id="mr-question-1" thread="mr-question-1"]<<}';
    const answerRaw =
      '{>>answer: Because. [markreview id="mr-answer-1" thread="mr-question-1" replyTo="mr-question-1" author="Codex"]<<}';
    const rawContent = `Before ${questionRaw} middle ${answerRaw} after`;
    const questionStart = rawContent.indexOf(questionRaw);
    const answerStart = rawContent.indexOf(answerRaw);
    const question = makeComment({
      id: "question-root",
      type: "question",
      text: "Why?",
      raw: questionRaw,
      rawStart: questionStart,
      rawEnd: questionStart + questionRaw.length,
      thread: {
        commentId: "mr-question-1",
        threadId: "mr-question-1",
      },
    });
    const answer = makeComment({
      id: "answer-reply",
      type: "answer",
      text: "Because.",
      raw: answerRaw,
      rawStart: answerStart,
      rawEnd: answerStart + answerRaw.length,
      thread: {
        commentId: "mr-answer-1",
        threadId: "mr-question-1",
        replyTo: "mr-question-1",
        authorLabel: "Codex",
      },
    });
    setTestState({
      fileHandle: handle,
      rawContent,
      comments: [question, answer],
    });

    await useAppStore.getState().deleteComment("question-root");

    const expectedContent = rawContent
      .replace(questionRaw, "")
      .replace(answerRaw, "");
    expect(mockWritable.write).toHaveBeenCalledWith(expectedContent);
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.rawContent).toBe(expectedContent);
    expect(tab?.rawContent).not.toContain("answer:");
    expect(tab?.undoState?.rawContent).toBe(rawContent);
  });

  it("removes only the selected answer when deleting a thread reply", async () => {
    const { handle, mockWritable } = makeHandle();
    const questionRaw =
      '{>>question: Why? [markreview id="mr-question-1" thread="mr-question-1"]<<}';
    const answerRaw =
      '{>>answer: Because. [markreview id="mr-answer-1" thread="mr-question-1" replyTo="mr-question-1" author="Codex"]<<}';
    const rawContent = `Before ${questionRaw} middle ${answerRaw} after`;
    const questionStart = rawContent.indexOf(questionRaw);
    const answerStart = rawContent.indexOf(answerRaw);
    setTestState({
      fileHandle: handle,
      rawContent,
      comments: [
        makeComment({
          id: "question-root",
          type: "question",
          text: "Why?",
          raw: questionRaw,
          rawStart: questionStart,
          rawEnd: questionStart + questionRaw.length,
          thread: {
            commentId: "mr-question-1",
            threadId: "mr-question-1",
          },
        }),
        makeComment({
          id: "answer-reply",
          type: "answer",
          text: "Because.",
          raw: answerRaw,
          rawStart: answerStart,
          rawEnd: answerStart + answerRaw.length,
          thread: {
            commentId: "mr-answer-1",
            threadId: "mr-question-1",
            replyTo: "mr-question-1",
            authorLabel: "Codex",
          },
        }),
      ],
    });

    await useAppStore.getState().deleteComment("answer-reply");

    const expectedContent = rawContent.replace(answerRaw, "");
    expect(mockWritable.write).toHaveBeenCalledWith(expectedContent);
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.rawContent).toContain("question:");
    expect(tab?.rawContent).not.toContain("answer:");
  });
});

describe("store.replyToCommentThread", () => {
  it("writes a linked user answer and saves undoState", async () => {
    const { handle, mockWritable } = makeHandle();
    const questionRaw =
      '{>>question: Why? [markreview id="mr-question-1" thread="mr-question-1"]<<}';
    const rawContent = `Before ${questionRaw} after`;
    const questionStart = rawContent.indexOf(questionRaw);
    setTestState({
      fileHandle: handle,
      rawContent,
      comments: [
        makeComment({
          id: "question-root",
          type: "question",
          text: "Why?",
          raw: questionRaw,
          rawStart: questionStart,
          rawEnd: questionStart + questionRaw.length,
          thread: {
            commentId: "mr-question-1",
            threadId: "mr-question-1",
          },
        }),
      ],
    });

    await useAppStore
      .getState()
      .replyToCommentThread("question-root", "Because it explains fallback.");

    const writtenContent: unknown = mockWritable.write.mock.calls[0]?.[0];
    if (typeof writtenContent !== "string") {
      throw new Error("Expected reply write to receive markdown text.");
    }

    expect(writtenContent).toMatch(
      /Before \{>>question: Why\? \[markreview id="mr-question-1" thread="mr-question-1"\]<<}\{>>answer: Because it explains fallback\. \[markreview id="mr-[^"]+" thread="mr-question-1" replyTo="mr-question-1" author="You"\]<<} after/,
    );
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.rawContent).toBe(writtenContent);
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
