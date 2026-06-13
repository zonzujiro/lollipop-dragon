import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../../../store";
import { getActiveTab } from "../../../store/selectors";
import {
  makeComment,
  resetTestStore,
  setTestState,
} from "../../../testing/testHelpers";
import type { AgentRuntime, AgentRunRequest } from "../../../runtime";
import {
  buildAddressCommentsAgentRunRequest,
  buildFolderAddressCommentsAgentRunRequest,
  buildQuestionThreadAgentRunRequest,
  createAgentWorkflowControllerActions,
  getAddressableCommentTargets,
  getFolderAddressableCommentTargets,
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
      workspaceRootPath: "/tmp/project",
    });

    expect(request).toMatchObject({
      tabId: "tab-1",
      taskKind: "address_comments",
      targetPaths: ["docs/spec.md"],
      selectedCommentIds: ["comment-1", "comment-2"],
      runnerKind: "terminal",
      workspaceRootPath: "/tmp/project",
    });
    expect(request.prompt).toContain("Work only in docs/spec.md");
    expect(request.prompt).toContain("- comment-1 (fix): Fix the intro");
    expect(request.prompt).toContain(
      "- comment-2 (rewrite): Rewrite this paragraph",
    );
    expect(request.prompt).toContain(
      "Do not answer threaded question comments",
    );
  });

  it("selects a bounded set of folder comment targets", () => {
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
        },
      ],
    });

    expect(request).toMatchObject({
      tabId: "tab-1",
      taskKind: "address_comments",
      targetPaths: ["docs/a.md", "docs/b.md"],
      selectedCommentIds: ["docs/a.md#fix-a", "docs/b.md#note-b"],
      runnerKind: "terminal",
      workspaceRootPath: "/tmp/project",
    });
    expect(request.prompt).toContain("Work only in the listed markdown files");
    expect(request.prompt).toContain("- docs/a.md");
    expect(request.prompt).toContain("  - fix-a (fix): Fix A");
    expect(request.prompt).toContain("- docs/b.md");
    expect(request.prompt).toContain("  - note-b (note): Check B");
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
    expect(request.prompt).toContain("- mr-question-1");
    expect(request.prompt).toContain("- mr-question-2");
    expect(request.prompt).toContain("Do not edit unrelated files");
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

  it("returns unavailable when no actionable comments exist", async () => {
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

    expect(result).toEqual({
      status: "unavailable",
      reason: "no_addressable_comments",
      message: "No unresolved actionable comments are available.",
    });
    expect(useAppStore.getState().agentRuns).toEqual({});
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
    expect(requests[0]?.prompt).toContain("  - fix-root (fix): Fix the intro");
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
