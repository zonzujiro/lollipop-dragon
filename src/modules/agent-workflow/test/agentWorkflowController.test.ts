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
});
