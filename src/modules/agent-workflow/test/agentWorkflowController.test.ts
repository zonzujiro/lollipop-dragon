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
  buildQuestionThreadAgentRunRequest,
  createAgentWorkflowControllerActions,
  getQuestionThreadCommentIds,
} from "../controller";

beforeEach(() => {
  resetTestStore();
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
      runnerKind: "terminal",
      terminalAttachmentId: "terminal-session-1",
    });
    expect(showToastMessages).toEqual(["Agent run started"]);
  });

  it("stops the active tab run through the injected runtime", async () => {
    const stoppedRuntimeRunIds: string[] = [];
    const runtime: AgentRuntime = {
      canRunAgent: true,
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
