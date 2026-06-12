import type { StoreApi } from "zustand";
import { buildAgentReplyPrompt, buildCommentThreadGroups } from "../../markup";
import { agentRuntime } from "../../runtime";
import type { AgentRuntime, AgentRunRequest } from "../../runtime";
import type { Comment } from "../../types/criticmarkup";
import {
  isNativeDirectoryTarget,
  isNativeFileTarget,
} from "../../types/fileTree";
import type { TabState } from "../../types/tab";
import type {
  AgentRunStartUnavailableReason,
  AgentRunStartResult,
  AgentWorkflowActions,
  AgentWorkflowControllerActions,
  AgentWorkflowState,
} from "./types";

type GetState<StoreState> = StoreApi<StoreState>["getState"];

interface AgentWorkflowControllerStoreState
  extends AgentWorkflowState, AgentWorkflowActions {}

interface AgentWorkflowControllerDeps<
  StoreState extends AgentWorkflowControllerStoreState,
> {
  get: GetState<StoreState>;
  getActiveTab: (get: () => StoreState) => TabState | null;
  showToast: (message: string) => void;
  runtime?: AgentRuntime;
}

interface QuestionThreadRunContext {
  tabId: string;
  targetPath: string;
  questionCommentIds: string[];
  workspaceRootPath: string | null;
}

export function getQuestionThreadCommentIds(comments: Comment[]): string[] {
  return buildCommentThreadGroups(comments)
    .filter((group) => group.root.type === "question" && !!group.root.thread)
    .map((group) => group.root.thread?.commentId ?? group.root.id);
}

function getAgentTargetPath(tab: TabState): string | null {
  return tab.activeFilePath ?? tab.fileName;
}

function getParentPath(path: string): string | null {
  const slashIndex = path.lastIndexOf("/");
  const backslashIndex = path.lastIndexOf("\\");
  const separatorIndex = Math.max(slashIndex, backslashIndex);
  if (separatorIndex <= 0) {
    return null;
  }

  return path.slice(0, separatorIndex);
}

function getAgentWorkspaceRootPath(tab: TabState): string | null {
  if (tab.directoryHandle && isNativeDirectoryTarget(tab.directoryHandle)) {
    return tab.directoryHandle.path;
  }

  if (tab.fileHandle && isNativeFileTarget(tab.fileHandle)) {
    return getParentPath(tab.fileHandle.path);
  }

  return null;
}

export function buildQuestionThreadAgentRunRequest(
  context: QuestionThreadRunContext,
): AgentRunRequest {
  const questionList = context.questionCommentIds
    .map((commentId) => `- ${commentId}`)
    .join("\n");

  return {
    tabId: context.tabId,
    taskKind: "answer_questions",
    targetPaths: [context.targetPath],
    selectedCommentIds: [...context.questionCommentIds],
    runnerKind: "terminal",
    workspaceRootPath: context.workspaceRootPath,
    prompt: `${buildAgentReplyPrompt()}

Scope:
- Work only in ${context.targetPath}.
- Answer only these MarkReview question thread ids:
${questionList}
- Do not edit unrelated files or unrelated comments.`,
  };
}

function unavailableResult(input: {
  reason: AgentRunStartUnavailableReason;
  message: string;
}): AgentRunStartResult {
  return {
    status: "unavailable",
    reason: input.reason,
    message: input.message,
  };
}

export function createAgentWorkflowControllerActions<
  StoreState extends AgentWorkflowControllerStoreState,
>(
  deps: AgentWorkflowControllerDeps<StoreState>,
): AgentWorkflowControllerActions {
  const runtime = deps.runtime ?? agentRuntime;

  return {
    startQuestionThreadAgentRun: async () => {
      if (!runtime.canRunAgent) {
        return unavailableResult({
          reason: "agent_unavailable",
          message: "Local agent execution is unavailable in this runtime.",
        });
      }

      const tab = deps.getActiveTab(deps.get);
      if (!tab) {
        return unavailableResult({
          reason: "no_active_tab",
          message: "Open a file or folder before starting an agent run.",
        });
      }

      const targetPath = getAgentTargetPath(tab);
      if (!targetPath) {
        return unavailableResult({
          reason: "no_active_file",
          message: "Select a markdown file before starting an agent run.",
        });
      }

      const questionCommentIds = getQuestionThreadCommentIds(tab.comments);
      if (questionCommentIds.length === 0) {
        return unavailableResult({
          reason: "no_question_threads",
          message: "No threaded questions are available for the active file.",
        });
      }

      const request = buildQuestionThreadAgentRunRequest({
        tabId: tab.id,
        targetPath,
        questionCommentIds,
        workspaceRootPath: getAgentWorkspaceRootPath(tab),
      });
      const run = deps.get().createAgentRun({
        tabId: request.tabId,
        taskKind: request.taskKind,
        targetPaths: request.targetPaths,
        selectedCommentIds: request.selectedCommentIds,
        runnerKind: request.runnerKind,
      });

      try {
        const runtimeRunId = await runtime.startRun(request);
        deps.get().updateAgentRunStatus({
          runId: run.id,
          status: "running",
          terminalAttachmentId: runtimeRunId,
        });
        deps.showToast("Agent run started");
        return {
          status: "started",
          run,
          runtimeRunId,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Agent run failed to start";
        console.error("[agent-workflow] failed to start agent run:", error);
        deps.get().updateAgentRunStatus({
          runId: run.id,
          status: "failed",
          errorMessage: message,
        });
        deps.showToast("Agent run failed to start");
        return unavailableResult({
          reason: "agent_unavailable",
          message,
        });
      }
    },
  };
}
