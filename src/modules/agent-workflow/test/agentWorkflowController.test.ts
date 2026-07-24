import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../../../store";
import { getActiveTab } from "../../../store/selectors";
import {
  makeComment,
  makePeerComment,
  resetTestStore,
  setTestState,
} from "../../../testing/testHelpers";
import type { AgentRuntime, AgentRunRequest } from "../../../runtime";
import {
  buildAddressCommentsAgentRunRequest,
  buildFolderAddressCommentsAgentRunRequest,
  buildPendingPeerCommentsAgentRunRequest,
  buildQuestionThreadAgentRunRequest,
  createAgentWorkflowControllerActions,
  getAddressableCommentTargets,
  getFolderAddressableCommentTargets,
  getFolderReviewCommentTargets,
  getPendingPeerCommentTargets,
  getQuestionThreadCommentIds,
} from "../controller";

beforeEach(() => {
  resetTestStore();
});

describe("address comments agent run context", () => {
  it("selects unresolved actionable root comments", () => {
    const commentTargets = getAddressableCommentTargets([
      makeComment({
        id: "fix-root",
        type: "fix",
        text: "Fix the intro",
      }),
      makeComment({
        id: "question-root",
        type: "question",
        text: "Why is this here?",
        thread: {
          commentId: "mr-question-1",
          threadId: "mr-question-1",
        },
      }),
      makeComment({
        id: "answer-reply",
        type: "answer",
        text: "Because it explains reconnect fallback.",
        thread: {
          commentId: "mr-answer-1",
          threadId: "mr-question-1",
          replyTo: "mr-question-1",
        },
      }),
      makeComment({
        id: "remove-reply",
        type: "remove",
        text: "Delete this section.",
        thread: {
          commentId: "mr-action-1",
          threadId: "mr-question-1",
          replyTo: "mr-question-1",
          authorLabel: "You",
        },
      }),
      makeComment({
        id: "note-root",
        type: "note",
        text: "Check this claim",
      }),
    ]);

    expect(commentTargets).toEqual([
      {
        id: "fix-root",
        type: "fix",
        text: "Fix the intro",
      },
      {
        id: "mr-action-1",
        type: "remove",
        text: "Delete this section.",
      },
      {
        id: "note-root",
        type: "note",
        text: "Check this claim",
      },
    ]);
  });

  it("builds a narrow active-file request for addressing comments", () => {
    const request = buildAddressCommentsAgentRunRequest({
      tabId: "tab-1",
      targetPath: "docs/spec.md",
      comments: [
        {
          id: "comment-1",
          type: "fix",
          text: "Fix the intro",
        },
        {
          id: "comment-2",
          type: "rewrite",
          text: "Rewrite this paragraph",
        },
      ],
      questionThreadIds: ["mr-question-custom"],
      workspaceRootPath: "/tmp/project",
    });

    expect(request).toMatchObject({
      tabId: "tab-1",
      taskKind: "address_comments",
      targetPaths: ["docs/spec.md"],
      selectedCommentIds: ["comment-1", "comment-2", "mr-question-custom"],
      runnerKind: "terminal",
      workspaceRootPath: "/tmp/project",
    });
    expect(request.prompt).toContain("Work only in docs/spec.md");
    expect(request.prompt).not.toContain("comment-1");
    expect(request.prompt).not.toContain("Fix the intro");
    expect(request.prompt).not.toContain("comment-2");
    expect(request.prompt).not.toContain("Rewrite this paragraph");
    expect(request.prompt).not.toContain("mr-question-custom");
    expect(request.prompt).toContain("Answer its MarkReview question threads");
    expect(request.prompt).toContain("Thread action replies");
    expect(request.prompt).toContain(
      "Do not add a new `answer:` or confirmation comment",
    );
    expect(request.prompt).toContain(
      "use short paragraphs separated by a blank line",
    );
  });

  it("selects a bounded set of folder target files", () => {
    const entries = Array.from({ length: 6 }, (_, index) => {
      const fileIndex = index + 1;
      return {
        filePath: `docs/file-${fileIndex}.md`,
        fileName: `file-${fileIndex}.md`,
        comments: [
          makeComment({
            id: `fix-${fileIndex}`,
            type: "fix",
            text: `Fix file ${fileIndex}`,
          }),
          makeComment({
            id: `question-${fileIndex}`,
            type: "question",
            text: `Question ${fileIndex}`,
            thread: {
              commentId: `mr-question-${fileIndex}`,
              threadId: `mr-question-${fileIndex}`,
            },
          }),
        ],
      };
    });

    const targets = getFolderAddressableCommentTargets(entries);

    expect(targets).toHaveLength(5);
    expect(targets.map((target) => target.filePath)).toEqual([
      "docs/file-1.md",
      "docs/file-2.md",
      "docs/file-3.md",
      "docs/file-4.md",
      "docs/file-5.md",
    ]);
    expect(targets[0]?.comments).toEqual([
      {
        id: "fix-1",
        type: "fix",
        text: "Fix file 1",
      },
    ]);
  });

  it("keeps all review targets in each selected folder file", () => {
    const comments = Array.from({ length: 30 }, (_unusedValue, index) =>
      makeComment({
        id: `fix-${index + 1}`,
        type: "fix",
        text: `Fix item ${index + 1}`,
      }),
    );
    comments.push(
      makeComment({
        id: "question-root",
        type: "question",
        text: "Why?",
        thread: {
          commentId: "mr-question-custom",
          threadId: "mr-question-custom",
        },
      }),
    );

    const targets = getFolderReviewCommentTargets([
      {
        filePath: "docs/spec.md",
        fileName: "spec.md",
        comments,
      },
    ]);

    expect(targets).toHaveLength(1);
    expect(targets[0]?.comments).toHaveLength(30);
    expect(targets[0]?.questionThreadIds).toEqual(["mr-question-custom"]);
  });

  it("selects folder review targets with question threads", () => {
    const targets = getFolderReviewCommentTargets([
      {
        filePath: "docs/questions.md",
        fileName: "questions.md",
        comments: [
          makeComment({
            id: "question-root",
            type: "question",
            text: "Why is this here?",
            thread: {
              commentId: "mr-question-1",
              threadId: "mr-question-1",
            },
          }),
        ],
      },
    ]);

    expect(targets).toEqual([
      {
        filePath: "docs/questions.md",
        comments: [],
        questionThreadIds: ["mr-question-1"],
      },
    ]);
  });

  it("builds a bounded folder request for addressing comments", () => {
    const request = buildFolderAddressCommentsAgentRunRequest({
      tabId: "tab-1",
      workspaceRootPath: "/tmp/project",
      targets: [
        {
          filePath: "docs/a.md",
          comments: [
            {
              id: "fix-a",
              type: "fix",
              text: "Fix A",
            },
          ],
          questionThreadIds: ["mr-question-a"],
        },
        {
          filePath: "docs/b.md",
          comments: [
            {
              id: "note-b",
              type: "note",
              text: "Check B",
            },
          ],
          questionThreadIds: [],
        },
      ],
    });

    expect(request).toMatchObject({
      tabId: "tab-1",
      taskKind: "address_comments",
      targetPaths: ["docs/a.md", "docs/b.md"],
      selectedCommentIds: [
        "docs/a.md#fix-a",
        "docs/a.md#mr-question-a",
        "docs/b.md#note-b",
      ],
      runnerKind: "terminal",
      workspaceRootPath: "/tmp/project",
    });
    expect(request.prompt).toContain("Work only in the listed markdown files");
    expect(request.prompt).toContain("- docs/a.md");
    expect(request.prompt).toContain("- docs/b.md");
    expect(request.prompt).not.toContain("fix-a");
    expect(request.prompt).not.toContain("Fix A");
    expect(request.prompt).not.toContain("mr-question-a");
    expect(request.prompt).not.toContain("note-b");
    expect(request.prompt).not.toContain("Check B");
    expect(request.prompt).toContain(
      "use short paragraphs separated by a blank line",
    );
  });
});

describe("question thread agent run context", () => {
  it("selects question thread roots by MarkReview comment id", () => {
    const commentIds = getQuestionThreadCommentIds([
      makeComment({
        id: "question-root",
        type: "question",
        thread: {
          commentId: "mr-question-1",
          threadId: "mr-question-1",
        },
      }),
      makeComment({
        id: "answer-reply",
        type: "answer",
        thread: {
          commentId: "mr-answer-1",
          threadId: "mr-question-1",
          replyTo: "mr-question-1",
        },
      }),
      makeComment({
        id: "plain-note",
        type: "note",
      }),
    ]);

    expect(commentIds).toEqual(["mr-question-1"]);
  });

  it("excludes question threads that contain user action replies", () => {
    const commentIds = getQuestionThreadCommentIds([
      makeComment({
        id: "question-root",
        type: "question",
        thread: {
          commentId: "mr-question-1",
          threadId: "mr-question-1",
        },
      }),
      makeComment({
        id: "remove-reply",
        type: "remove",
        thread: {
          commentId: "mr-action-1",
          threadId: "mr-question-1",
          replyTo: "mr-question-1",
          authorLabel: "You",
        },
      }),
    ]);

    expect(commentIds).toEqual([]);
  });

  it("builds a narrow active-file request for answering questions", () => {
    const request = buildQuestionThreadAgentRunRequest({
      tabId: "tab-1",
      targetPath: "docs/spec.md",
      questionCommentIds: ["mr-question-1", "mr-question-2"],
      workspaceRootPath: "/tmp/project",
    });

    expect(request).toMatchObject({
      tabId: "tab-1",
      taskKind: "answer_questions",
      targetPaths: ["docs/spec.md"],
      selectedCommentIds: ["mr-question-1", "mr-question-2"],
      runnerKind: "terminal",
      workspaceRootPath: "/tmp/project",
    });
    expect(request.prompt).toContain("Work only in docs/spec.md");
    expect(request.prompt).toContain("Read the entire existing thread");
    expect(request.prompt).toContain(
      "use short paragraphs separated by a blank line",
    );
    expect(request.prompt).toContain(
      "do not add a line break after every sentence",
    );
    expect(request.prompt).toContain("- mr-question-1");
    expect(request.prompt).toContain("- mr-question-2");
    expect(request.prompt).toContain("Do not edit unrelated files");
  });
});

describe("pending peer comments agent run context", () => {
  it("groups and bounds pending peer comments by path", () => {
    const comments = Array.from({ length: 6 }, (_unusedValue, index) => {
      const fileIndex = index + 1;
      return makePeerComment({
        id: `peer-${fileIndex}`,
        peerName: "Alice",
        path: `docs/file-${fileIndex}.md`,
        blockRef: {
          blockIndex: fileIndex,
          contentPreview: `Preview ${fileIndex}`,
        },
        commentType: "note",
        text: `Check file ${fileIndex}`,
      });
    });

    const targets = getPendingPeerCommentTargets(comments);

    expect(targets).toHaveLength(5);
    expect(targets.map((target) => target.filePath)).toEqual([
      "docs/file-1.md",
      "docs/file-2.md",
      "docs/file-3.md",
      "docs/file-4.md",
      "docs/file-5.md",
    ]);
    expect(targets[0]?.comments).toEqual([
      {
        id: "peer-1",
        peerName: "Alice",
        commentType: "note",
        text: "Check file 1",
        blockIndex: 1,
        contentPreview: "Preview 1",
      },
    ]);
  });

  it("builds a pending peer comments request", () => {
    const request = buildPendingPeerCommentsAgentRunRequest({
      tabId: "tab-1",
      workspaceRootPath: "/tmp/project",
      targets: [
        {
          filePath: "docs/spec.md",
          comments: [
            {
              id: "peer-1",
              peerName: "Alice",
              commentType: "fix",
              text: "Fix the intro",
              blockIndex: 0,
              contentPreview: "Intro paragraph",
            },
          ],
        },
      ],
    });

    expect(request).toMatchObject({
      tabId: "tab-1",
      taskKind: "review_peer_comments",
      targetPaths: ["docs/spec.md"],
      selectedCommentIds: ["docs/spec.md#peer-1"],
      runnerKind: "terminal",
      workspaceRootPath: "/tmp/project",
    });
    expect(request.prompt).toContain("Review these pending peer comments");
    expect(request.prompt).toContain("- docs/spec.md");
    expect(request.prompt).toContain(
      "  - peer-1 (fix) from Alice at block 1: Fix the intro",
    );
  });
});

describe("address comments agent run controller", () => {
  it("creates a run and starts the injected runtime", async () => {
    const requests: AgentRunRequest[] = [];
    const runtime: AgentRuntime = {
      canRunAgent: true,
      getCapability: () =>
        Promise.resolve({ canRunAgent: true, unavailableMessage: null }),
      startRun: (request) => {
        requests.push(request);
        return Promise.resolve("terminal-session-1");
      },
      stopRun: () => Promise.resolve(),
      getRunStatus: () => Promise.resolve({ status: "running", output: "" }),
    };
    const showToastMessages: string[] = [];
    const actions = createAgentWorkflowControllerActions({
      get: useAppStore.getState,
      getActiveTab: (get) => getActiveTab(get()),
      showToast: (message) => {
        showToastMessages.push(message);
      },
      runtime,
    });

    setTestState({
      fileName: "spec.md",
      activeFilePath: "docs/spec.md",
      directoryHandle: {
        kind: "native_directory",
        path: "/tmp/project",
        name: "project",
      },
      comments: [
        makeComment({
          id: "fix-root",
          type: "fix",
          text: "Fix the intro",
        }),
      ],
    });

    const result = await actions.startAddressCommentsAgentRun();

    expect(result.status).toBe("started");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      tabId: "test-tab",
      taskKind: "address_comments",
      targetPaths: ["docs/spec.md"],
      selectedCommentIds: ["fix-root"],
      workspaceRootPath: "/tmp/project",
    });
    const state = useAppStore.getState();
    const runId = state.activeAgentRunIdByTabId["test-tab"];
    const run = runId ? state.agentRuns[runId] : null;
    expect(run).toMatchObject({
      tabId: "test-tab",
      status: "running",
      taskKind: "address_comments",
      targetPaths: ["docs/spec.md"],
      selectedCommentIds: ["fix-root"],
      prompt: requests[0]?.prompt,
      runnerKind: "terminal",
      terminalAttachmentId: "terminal-session-1",
    });
    expect(showToastMessages).toEqual(["Agent run started"]);
  });

  it("does not start a second run for the active tab", async () => {
    const requests: AgentRunRequest[] = [];
    const runtime: AgentRuntime = {
      canRunAgent: true,
      getCapability: () =>
        Promise.resolve({ canRunAgent: true, unavailableMessage: null }),
      startRun: (request) => {
        requests.push(request);
        return Promise.resolve("terminal-session-1");
      },
      stopRun: () => Promise.resolve(),
      getRunStatus: () => Promise.resolve({ status: "running", output: "" }),
    };
    const actions = createAgentWorkflowControllerActions({
      get: useAppStore.getState,
      getActiveTab: (get) => getActiveTab(get()),
      showToast: () => {},
      runtime,
    });

    setTestState({
      fileName: "spec.md",
      comments: [
        makeComment({
          id: "fix-root",
          type: "fix",
          text: "Fix the intro",
        }),
      ],
    });
    const run = useAppStore.getState().createAgentRun({
      tabId: "test-tab",
      taskKind: "address_comments",
      targetPaths: ["spec.md"],
      runnerKind: "terminal",
    });
    useAppStore.getState().updateAgentRunStatus({
      runId: run.id,
      status: "running",
      terminalAttachmentId: "native-run-1",
    });

    const result = await actions.startAddressCommentsAgentRun();

    expect(result).toEqual({
      status: "unavailable",
      reason: "tab_agent_run_active",
      message: "Stop the active agent run in this tab before starting another.",
    });
    expect(requests).toEqual([]);
    expect(useAppStore.getState().activeAgentRunIdByTabId["test-tab"]).toBe(
      run.id,
    );
  });

  it("does not start a run when the app-wide active run limit is reached", async () => {
    const requests: AgentRunRequest[] = [];
    const runtime: AgentRuntime = {
      canRunAgent: true,
      getCapability: () =>
        Promise.resolve({ canRunAgent: true, unavailableMessage: null }),
      startRun: (request) => {
        requests.push(request);
        return Promise.resolve("terminal-session-1");
      },
      stopRun: () => Promise.resolve(),
      getRunStatus: () => Promise.resolve({ status: "running", output: "" }),
    };
    const actions = createAgentWorkflowControllerActions({
      get: useAppStore.getState,
      getActiveTab: (get) => getActiveTab(get()),
      showToast: () => {},
      runtime,
    });

    setTestState({
      fileName: "spec.md",
      comments: [
        makeComment({
          id: "fix-root",
          type: "fix",
          text: "Fix the intro",
        }),
      ],
    });
    for (const tabId of ["tab-1", "tab-2", "tab-3"]) {
      const run = useAppStore.getState().createAgentRun({
        tabId,
        taskKind: "address_comments",
        targetPaths: [`${tabId}.md`],
        runnerKind: "terminal",
      });
      useAppStore.getState().updateAgentRunStatus({
        runId: run.id,
        status: "running",
        terminalAttachmentId: `native-${tabId}`,
      });
    }

    const result = await actions.startAddressCommentsAgentRun();

    expect(result).toEqual({
      status: "unavailable",
      reason: "active_run_limit_reached",
      message:
        "Too many agent runs are active. Stop or wait for one run before starting another.",
    });
    expect(requests).toEqual([]);
  });

  it("creates a review run when only question threads exist", async () => {
    const requests: AgentRunRequest[] = [];
    const runtime: AgentRuntime = {
      canRunAgent: true,
      getCapability: () =>
        Promise.resolve({ canRunAgent: true, unavailableMessage: null }),
      startRun: (request) => {
        requests.push(request);
        return Promise.resolve("terminal-session-1");
      },
      stopRun: () => Promise.resolve(),
      getRunStatus: () => Promise.resolve({ status: "running", output: "" }),
    };
    const showToastMessages: string[] = [];
    const actions = createAgentWorkflowControllerActions({
      get: useAppStore.getState,
      getActiveTab: (get) => getActiveTab(get()),
      showToast: (message) => {
        showToastMessages.push(message);
      },
      runtime,
    });

    setTestState({
      fileName: "spec.md",
      comments: [
        makeComment({
          type: "question",
          thread: {
            commentId: "mr-question-1",
            threadId: "mr-question-1",
          },
        }),
      ],
    });

    const result = await actions.startAddressCommentsAgentRun();

    expect(result.status).toBe("started");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      tabId: "test-tab",
      taskKind: "address_comments",
      targetPaths: ["spec.md"],
      selectedCommentIds: ["mr-question-1"],
    });
    expect(requests[0]?.prompt).toContain(
      "Answer its MarkReview question threads",
    );
    expect(showToastMessages).toEqual(["Agent run started"]);
  });

  it("creates a folder run from scanned file comments", async () => {
    const requests: AgentRunRequest[] = [];
    const runtime: AgentRuntime = {
      canRunAgent: true,
      getCapability: () =>
        Promise.resolve({ canRunAgent: true, unavailableMessage: null }),
      startRun: (request) => {
        requests.push(request);
        return Promise.resolve("terminal-session-1");
      },
      stopRun: () => Promise.resolve(),
      getRunStatus: () => Promise.resolve({ status: "running", output: "" }),
    };
    const actions = createAgentWorkflowControllerActions({
      get: useAppStore.getState,
      getActiveTab: (get) => getActiveTab(get()),
      showToast: () => {},
      runtime,
    });

    setTestState({
      directoryHandle: {
        kind: "native_directory",
        path: "/tmp/project",
        name: "project",
      },
      fileTree: [
        {
          kind: "file",
          name: "spec.md",
          path: "docs/spec.md",
        },
      ],
      allFileComments: {
        "docs/spec.md": {
          filePath: "docs/spec.md",
          fileName: "spec.md",
          comments: [
            makeComment({
              id: "fix-root",
              type: "fix",
              text: "Fix the intro",
            }),
          ],
        },
      },
    });

    const result = await actions.startAddressCommentsAgentRun();

    expect(result.status).toBe("started");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      tabId: "test-tab",
      taskKind: "address_comments",
      targetPaths: ["docs/spec.md"],
      selectedCommentIds: ["docs/spec.md#fix-root"],
      workspaceRootPath: "/tmp/project",
    });
    expect(requests[0]?.prompt).toContain("- docs/spec.md");
    expect(requests[0]?.prompt).not.toContain("fix-root");
    expect(requests[0]?.prompt).not.toContain("Fix the intro");
  });
});

describe("pending peer comments agent run controller", () => {
  it("creates a run and starts the injected runtime", async () => {
    const requests: AgentRunRequest[] = [];
    const runtime: AgentRuntime = {
      canRunAgent: true,
      getCapability: () =>
        Promise.resolve({ canRunAgent: true, unavailableMessage: null }),
      startRun: (request) => {
        requests.push(request);
        return Promise.resolve("terminal-session-1");
      },
      stopRun: () => Promise.resolve(),
      getRunStatus: () => Promise.resolve({ status: "running", output: "" }),
    };
    const actions = createAgentWorkflowControllerActions({
      get: useAppStore.getState,
      getActiveTab: (get) => getActiveTab(get()),
      showToast: () => {},
      runtime,
    });

    setTestState({
      directoryHandle: {
        kind: "native_directory",
        path: "/tmp/project",
        name: "project",
      },
      pendingComments: {
        "doc-1": [
          makePeerComment({
            id: "peer-1",
            peerName: "Alice",
            path: "docs/spec.md",
            blockRef: {
              blockIndex: 0,
              contentPreview: "Intro paragraph",
            },
            commentType: "fix",
            text: "Fix the intro",
          }),
        ],
      },
    });

    const result = await actions.startPeerCommentsAgentRun("doc-1");

    expect(result.status).toBe("started");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      tabId: "test-tab",
      taskKind: "review_peer_comments",
      targetPaths: ["docs/spec.md"],
      selectedCommentIds: ["docs/spec.md#peer-1"],
      workspaceRootPath: "/tmp/project",
    });
    const state = useAppStore.getState();
    const runId = state.activeAgentRunIdByTabId["test-tab"];
    const run = runId ? state.agentRuns[runId] : null;
    expect(run).toMatchObject({
      tabId: "test-tab",
      status: "running",
      taskKind: "review_peer_comments",
      targetPaths: ["docs/spec.md"],
      selectedCommentIds: ["docs/spec.md#peer-1"],
      prompt: requests[0]?.prompt,
      runnerKind: "terminal",
      terminalAttachmentId: "terminal-session-1",
    });
  });

  it("returns unavailable when no pending peer comments exist", async () => {
    const runtime: AgentRuntime = {
      canRunAgent: true,
      getCapability: () =>
        Promise.resolve({ canRunAgent: true, unavailableMessage: null }),
      startRun: () => Promise.resolve("terminal-session-1"),
      stopRun: () => Promise.resolve(),
      getRunStatus: () => Promise.resolve({ status: "running", output: "" }),
    };
    const actions = createAgentWorkflowControllerActions({
      get: useAppStore.getState,
      getActiveTab: (get) => getActiveTab(get()),
      showToast: () => {},
      runtime,
    });

    setTestState({
      pendingComments: {},
    });

    const result = await actions.startPeerCommentsAgentRun("doc-1");

    expect(result).toEqual({
      status: "unavailable",
      reason: "no_peer_comments",
      message: "No pending peer comments are available for this share.",
    });
  });
});

describe("question thread agent run controller", () => {
  it("returns unavailable without creating a run in the web runtime", async () => {
    setTestState({
      fileName: "spec.md",
      comments: [
        makeComment({
          type: "question",
          thread: {
            commentId: "mr-question-1",
            threadId: "mr-question-1",
          },
        }),
      ],
    });

    const result = await useAppStore.getState().startQuestionThreadAgentRun();

    expect(result).toEqual({
      status: "unavailable",
      reason: "agent_unavailable",
      message: "Local agent execution is unavailable in this runtime.",
    });
    expect(useAppStore.getState().agentRuns).toEqual({});
  });

  it("creates a run and starts the injected runtime", async () => {
    const requests: AgentRunRequest[] = [];
    const runtime: AgentRuntime = {
      canRunAgent: true,
      getCapability: () =>
        Promise.resolve({ canRunAgent: true, unavailableMessage: null }),
      startRun: (request) => {
        requests.push(request);
        return Promise.resolve("terminal-session-1");
      },
      stopRun: () => Promise.resolve(),
      getRunStatus: () => Promise.resolve({ status: "running", output: "" }),
    };
    const showToastMessages: string[] = [];
    const actions = createAgentWorkflowControllerActions({
      get: useAppStore.getState,
      getActiveTab: (get) => getActiveTab(get()),
      showToast: (message) => {
        showToastMessages.push(message);
      },
      runtime,
    });

    setTestState({
      fileName: "spec.md",
      activeFilePath: "docs/spec.md",
      directoryHandle: {
        kind: "native_directory",
        path: "/tmp/project",
        name: "project",
      },
      comments: [
        makeComment({
          type: "question",
          thread: {
            commentId: "mr-question-1",
            threadId: "mr-question-1",
          },
        }),
      ],
    });

    const result = await actions.startQuestionThreadAgentRun();

    expect(result.status).toBe("started");
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      tabId: "test-tab",
      taskKind: "answer_questions",
      targetPaths: ["docs/spec.md"],
      selectedCommentIds: ["mr-question-1"],
      workspaceRootPath: "/tmp/project",
    });
    const state = useAppStore.getState();
    const runId = state.activeAgentRunIdByTabId["test-tab"];
    const run = runId ? state.agentRuns[runId] : null;
    expect(run).toMatchObject({
      tabId: "test-tab",
      status: "running",
      taskKind: "answer_questions",
      targetPaths: ["docs/spec.md"],
      selectedCommentIds: ["mr-question-1"],
      prompt: requests[0]?.prompt,
      runnerKind: "terminal",
      terminalAttachmentId: "terminal-session-1",
    });
    expect(showToastMessages).toEqual(["Agent run started"]);
  });

  it("stops the active tab run through the injected runtime", async () => {
    const stoppedRuntimeRunIds: string[] = [];
    const runtime: AgentRuntime = {
      canRunAgent: true,
      getCapability: () =>
        Promise.resolve({ canRunAgent: true, unavailableMessage: null }),
      startRun: () => Promise.resolve("terminal-session-1"),
      stopRun: (runId) => {
        stoppedRuntimeRunIds.push(runId);
        return Promise.resolve();
      },
      getRunStatus: () => Promise.resolve({ status: "running", output: "" }),
    };
    const showToastMessages: string[] = [];
    const actions = createAgentWorkflowControllerActions({
      get: useAppStore.getState,
      getActiveTab: (get) => getActiveTab(get()),
      showToast: (message) => {
        showToastMessages.push(message);
      },
      runtime,
    });

    setTestState({
      fileName: "spec.md",
    });
    const run = useAppStore.getState().createAgentRun({
      tabId: "test-tab",
      taskKind: "answer_questions",
      targetPaths: ["spec.md"],
      runnerKind: "terminal",
    });
    useAppStore.getState().updateAgentRunStatus({
      runId: run.id,
      status: "running",
      terminalAttachmentId: "native-run-1",
    });

    const result = await actions.stopActiveAgentRun();

    expect(result).toEqual({
      status: "stopped",
      runId: run.id,
    });
    expect(stoppedRuntimeRunIds).toEqual(["native-run-1"]);
    expect(useAppStore.getState().agentRuns[run.id]?.status).toBe("stopped");
    expect(showToastMessages).toEqual(["Agent run stopped"]);
  });

  it("syncs a completed native runtime run into the active tab run", async () => {
    const checkedRuntimeRunIds: string[] = [];
    const runtime: AgentRuntime = {
      canRunAgent: true,
      getCapability: () =>
        Promise.resolve({ canRunAgent: true, unavailableMessage: null }),
      startRun: () => Promise.resolve("terminal-session-1"),
      stopRun: () => Promise.resolve(),
      getRunStatus: (runId) => {
        checkedRuntimeRunIds.push(runId);
        return Promise.resolve({
          status: "completed",
          exitCode: 0,
          output: "Done\n",
        });
      },
    };
    const showToastMessages: string[] = [];
    const actions = createAgentWorkflowControllerActions({
      get: useAppStore.getState,
      getActiveTab: (get) => getActiveTab(get()),
      showToast: (message) => {
        showToastMessages.push(message);
      },
      runtime,
    });

    setTestState({
      fileName: "spec.md",
    });
    const run = useAppStore.getState().createAgentRun({
      tabId: "test-tab",
      taskKind: "answer_questions",
      targetPaths: ["spec.md"],
      runnerKind: "terminal",
    });
    useAppStore.getState().updateAgentRunStatus({
      runId: run.id,
      status: "running",
      terminalAttachmentId: "native-run-1",
    });

    const result = await actions.syncActiveAgentRunStatus();

    expect(result).toEqual({
      status: "synced",
      runId: run.id,
      runStatus: "completed",
    });
    expect(checkedRuntimeRunIds).toEqual(["native-run-1"]);
    expect(useAppStore.getState().agentRuns[run.id]?.status).toBe("completed");
    expect(useAppStore.getState().agentRuns[run.id]?.output).toBe("Done\n");
    expect(showToastMessages).toEqual(["Agent run completed"]);
  });

  it("syncs a failed native runtime run into the active tab run", async () => {
    const runtime: AgentRuntime = {
      canRunAgent: true,
      getCapability: () =>
        Promise.resolve({ canRunAgent: true, unavailableMessage: null }),
      startRun: () => Promise.resolve("terminal-session-1"),
      stopRun: () => Promise.resolve(),
      getRunStatus: () =>
        Promise.resolve({
          status: "failed",
          exitCode: 7,
          message: "Agent exited with code 7",
          output: "Command failed\n",
        }),
    };
    const showToastMessages: string[] = [];
    const actions = createAgentWorkflowControllerActions({
      get: useAppStore.getState,
      getActiveTab: (get) => getActiveTab(get()),
      showToast: (message) => {
        showToastMessages.push(message);
      },
      runtime,
    });

    setTestState({
      fileName: "spec.md",
    });
    const run = useAppStore.getState().createAgentRun({
      tabId: "test-tab",
      taskKind: "answer_questions",
      targetPaths: ["spec.md"],
      runnerKind: "terminal",
    });
    useAppStore.getState().updateAgentRunStatus({
      runId: run.id,
      status: "running",
      terminalAttachmentId: "native-run-1",
    });

    const result = await actions.syncActiveAgentRunStatus();

    expect(result).toEqual({
      status: "synced",
      runId: run.id,
      runStatus: "failed",
    });
    expect(useAppStore.getState().agentRuns[run.id]).toMatchObject({
      status: "failed",
      errorMessage: "Agent exited with code 7",
      output: "Command failed\n",
    });
    expect(showToastMessages).toEqual(["Agent run failed"]);
  });
});
