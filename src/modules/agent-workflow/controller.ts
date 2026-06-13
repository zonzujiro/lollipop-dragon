import type { StoreApi } from "zustand";
import {
  buildAddressCommentsAgentPrompt,
  buildAgentReplyPrompt,
  buildCommentThreadGroups,
  buildFolderAddressCommentsAgentPrompt,
} from "../../markup";
import { agentRuntime } from "../../runtime";
import type {
  AgentRuntime,
  AgentRunRequest,
  AgentRuntimeRunStatus,
} from "../../runtime";
import type { Comment } from "../../types/criticmarkup";
import {
  isNativeDirectoryTarget,
  isNativeFileTarget,
} from "../../types/fileTree";
import type { FileCommentEntry } from "../../types/tab";
import type { TabState } from "../../types/tab";
import type {
  AgentRunStartUnavailableReason,
  AgentRunStartResult,
  AgentRunStatus,
  AgentRunSyncStatusResult,
  AgentRunSyncStatusUnavailableReason,
  AgentRunStopUnavailableReason,
  AgentRunStopResult,
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

interface AddressableCommentTarget {
  id: string;
  type: string;
  text: string;
}

interface AddressCommentsRunContext {
  tabId: string;
  targetPath: string;
  comments: AddressableCommentTarget[];
  workspaceRootPath: string | null;
}

interface FolderAddressableCommentTarget {
  filePath: string;
  comments: AddressableCommentTarget[];
}

interface FolderAddressCommentsRunContext {
  tabId: string;
  targets: FolderAddressableCommentTarget[];
  workspaceRootPath: string | null;
}

const SYNCABLE_AGENT_RUN_STATUSES = new Set<AgentRunStatus>([
  "queued",
  "running",
  "needs_attention",
]);
const MAX_ACTIVE_AGENT_RUNS = 3;
const MAX_FOLDER_AGENT_TARGET_FILES = 5;
const MAX_FOLDER_AGENT_COMMENTS = 25;
const ADDRESSABLE_COMMENT_TYPES = new Set<Comment["type"]>([
  "fix",
  "rewrite",
  "expand",
  "clarify",
  "remove",
  "note",
]);

export function getQuestionThreadCommentIds(comments: Comment[]): string[] {
  return buildCommentThreadGroups(comments)
    .filter((group) => group.root.type === "question" && !!group.root.thread)
    .map((group) => group.root.thread?.commentId ?? group.root.id);
}

function commentPromptText(comment: Comment): string {
  return (
    comment.text ||
    comment.highlightedText ||
    comment.from ||
    comment.to ||
    comment.raw
  );
}

export function getAddressableCommentTargets(
  comments: Comment[],
): AddressableCommentTarget[] {
  return buildCommentThreadGroups(comments)
    .map((group) => group.root)
    .filter((comment) => ADDRESSABLE_COMMENT_TYPES.has(comment.type))
    .map((comment) => ({
      id: comment.thread?.commentId ?? comment.id,
      type: comment.type,
      text: commentPromptText(comment),
    }));
}

export function getFolderAddressableCommentTargets(
  entries: FileCommentEntry[],
): FolderAddressableCommentTarget[] {
  const targets: FolderAddressableCommentTarget[] = [];
  let selectedCommentCount = 0;

  const sortedEntries = [...entries].sort((entryA, entryB) =>
    entryA.filePath.localeCompare(entryB.filePath),
  );

  for (const entry of sortedEntries) {
    if (targets.length >= MAX_FOLDER_AGENT_TARGET_FILES) {
      break;
    }
    if (selectedCommentCount >= MAX_FOLDER_AGENT_COMMENTS) {
      break;
    }

    const remainingCommentCount =
      MAX_FOLDER_AGENT_COMMENTS - selectedCommentCount;
    const comments = getAddressableCommentTargets(entry.comments).slice(
      0,
      remainingCommentCount,
    );
    if (comments.length === 0) {
      continue;
    }

    targets.push({
      filePath: entry.filePath,
      comments,
    });
    selectedCommentCount += comments.length;
  }

  return targets;
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

export function buildAddressCommentsAgentRunRequest(
  context: AddressCommentsRunContext,
): AgentRunRequest {
  return {
    tabId: context.tabId,
    taskKind: "address_comments",
    targetPaths: [context.targetPath],
    selectedCommentIds: context.comments.map((comment) => comment.id),
    runnerKind: "terminal",
    workspaceRootPath: context.workspaceRootPath,
    prompt: buildAddressCommentsAgentPrompt({
      targetPath: context.targetPath,
      comments: context.comments,
    }),
  };
}

export function buildFolderAddressCommentsAgentRunRequest(
  context: FolderAddressCommentsRunContext,
): AgentRunRequest {
  return {
    tabId: context.tabId,
    taskKind: "address_comments",
    targetPaths: context.targets.map((target) => target.filePath),
    selectedCommentIds: context.targets.flatMap((target) =>
      target.comments.map((comment) => `${target.filePath}#${comment.id}`),
    ),
    runnerKind: "terminal",
    workspaceRootPath: context.workspaceRootPath,
    prompt: buildFolderAddressCommentsAgentPrompt({
      targets: context.targets,
    }),
  };
}

function isFolderAgentRunTab(tab: TabState): boolean {
  return tab.fileTree.length > 0;
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

function unavailableStopResult(input: {
  reason: AgentRunStopUnavailableReason;
  message: string;
}): AgentRunStopResult {
  return {
    status: "unavailable",
    reason: input.reason,
    message: input.message,
  };
}

function unchangedSyncResult(input: {
  reason: AgentRunSyncStatusUnavailableReason;
  message: string;
}): AgentRunSyncStatusResult {
  return {
    status: "unchanged",
    reason: input.reason,
    message: input.message,
  };
}

function unavailableSyncResult(input: {
  reason: AgentRunSyncStatusUnavailableReason;
  message: string;
}): AgentRunSyncStatusResult {
  return {
    status: "unavailable",
    reason: input.reason,
    message: input.message,
  };
}

function failedRuntimeStatusMessage(status: AgentRuntimeRunStatus): string {
  if (status.status === "failed") {
    return status.message;
  }
  if (status.status === "not_found") {
    return status.message;
  }
  return "Agent run failed";
}

function countActiveAgentRuns(state: AgentWorkflowState): number {
  return Object.values(state.agentRuns).filter((run) =>
    SYNCABLE_AGENT_RUN_STATUSES.has(run.status),
  ).length;
}

function hasActiveAgentRunForTab(
  state: AgentWorkflowState,
  tabId: string,
): boolean {
  const runId = state.activeAgentRunIdByTabId[tabId];
  const run = runId ? state.agentRuns[runId] : null;
  return Boolean(run && SYNCABLE_AGENT_RUN_STATUSES.has(run.status));
}

function getRunStartGuardResult(
  state: AgentWorkflowState,
  tabId: string,
): AgentRunStartResult | null {
  if (hasActiveAgentRunForTab(state, tabId)) {
    return unavailableResult({
      reason: "tab_agent_run_active",
      message: "Stop the active agent run in this tab before starting another.",
    });
  }

  if (countActiveAgentRuns(state) >= MAX_ACTIVE_AGENT_RUNS) {
    return unavailableResult({
      reason: "active_run_limit_reached",
      message:
        "Too many agent runs are active. Stop or wait for one run before starting another.",
    });
  }

  return null;
}

export function createAgentWorkflowControllerActions<
  StoreState extends AgentWorkflowControllerStoreState,
>(
  deps: AgentWorkflowControllerDeps<StoreState>,
): AgentWorkflowControllerActions {
  const runtime = deps.runtime ?? agentRuntime;

  async function startRuntimeAgentRun(
    request: AgentRunRequest,
  ): Promise<AgentRunStartResult> {
    const run = deps.get().createAgentRun({
      tabId: request.tabId,
      taskKind: request.taskKind,
      targetPaths: request.targetPaths,
      selectedCommentIds: request.selectedCommentIds,
      prompt: request.prompt,
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
  }

  function getRunnableActiveTab(): {
    tab: TabState;
    targetPath: string;
  } | null {
    const tab = deps.getActiveTab(deps.get);
    if (!tab) {
      return null;
    }

    const targetPath = getAgentTargetPath(tab);
    if (!targetPath) {
      return null;
    }

    return { tab, targetPath };
  }

  return {
    startAddressCommentsAgentRun: async () => {
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

      const guardResult = getRunStartGuardResult(deps.get(), tab.id);
      if (guardResult) {
        return guardResult;
      }

      if (isFolderAgentRunTab(tab)) {
        const folderTargets = getFolderAddressableCommentTargets(
          Object.values(tab.allFileComments),
        );
        if (folderTargets.length === 0) {
          return unavailableResult({
            reason: "no_addressable_comments",
            message: "No unresolved actionable comments are available.",
          });
        }

        return startRuntimeAgentRun(
          buildFolderAddressCommentsAgentRunRequest({
            tabId: tab.id,
            targets: folderTargets,
            workspaceRootPath: getAgentWorkspaceRootPath(tab),
          }),
        );
      }

      const targetPath = getAgentTargetPath(tab);
      if (!targetPath) {
        return unavailableResult({
          reason: "no_active_file",
          message: "Select a markdown file before starting an agent run.",
        });
      }

      const addressableComments = getAddressableCommentTargets(tab.comments);
      if (addressableComments.length === 0) {
        return unavailableResult({
          reason: "no_addressable_comments",
          message: "No unresolved actionable comments are available.",
        });
      }

      return startRuntimeAgentRun(
        buildAddressCommentsAgentRunRequest({
          tabId: tab.id,
          targetPath,
          comments: addressableComments,
          workspaceRootPath: getAgentWorkspaceRootPath(tab),
        }),
      );
    },

    startQuestionThreadAgentRun: async () => {
      if (!runtime.canRunAgent) {
        return unavailableResult({
          reason: "agent_unavailable",
          message: "Local agent execution is unavailable in this runtime.",
        });
      }

      const activeTab = getRunnableActiveTab();
      if (!activeTab) {
        const tab = deps.getActiveTab(deps.get);
        return unavailableResult({
          reason: tab ? "no_active_file" : "no_active_tab",
          message: tab
            ? "Select a markdown file before starting an agent run."
            : "Open a file or folder before starting an agent run.",
        });
      }

      const guardResult = getRunStartGuardResult(deps.get(), activeTab.tab.id);
      if (guardResult) {
        return guardResult;
      }

      const questionCommentIds = getQuestionThreadCommentIds(
        activeTab.tab.comments,
      );
      if (questionCommentIds.length === 0) {
        return unavailableResult({
          reason: "no_question_threads",
          message: "No threaded questions are available for the active file.",
        });
      }

      return startRuntimeAgentRun(
        buildQuestionThreadAgentRunRequest({
          tabId: activeTab.tab.id,
          targetPath: activeTab.targetPath,
          questionCommentIds,
          workspaceRootPath: getAgentWorkspaceRootPath(activeTab.tab),
        }),
      );
    },

    stopActiveAgentRun: async () => {
      const tab = deps.getActiveTab(deps.get);
      if (!tab) {
        return unavailableStopResult({
          reason: "no_active_tab",
          message: "Open a file or folder before stopping an agent run.",
        });
      }

      const runId = deps.get().activeAgentRunIdByTabId[tab.id];
      const run = runId ? deps.get().agentRuns[runId] : null;
      if (!run) {
        return unavailableStopResult({
          reason: "no_active_run",
          message: "No active agent run is attached to this tab.",
        });
      }

      try {
        if (run.terminalAttachmentId) {
          await runtime.stopRun(run.terminalAttachmentId);
        }
        deps.get().updateAgentRunStatus({
          runId: run.id,
          status: "stopped",
        });
        deps.showToast("Agent run stopped");
        return {
          status: "stopped",
          runId: run.id,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Agent run failed to stop";
        console.error("[agent-workflow] failed to stop agent run:", error);
        deps.get().updateAgentRunStatus({
          runId: run.id,
          status: "failed",
          errorMessage: message,
        });
        deps.showToast("Agent run failed to stop");
        return unavailableStopResult({
          reason: "runtime_stop_failed",
          message,
        });
      }
    },

    syncActiveAgentRunStatus: async () => {
      const tab = deps.getActiveTab(deps.get);
      if (!tab) {
        return unchangedSyncResult({
          reason: "no_active_tab",
          message: "Open a file or folder before syncing an agent run.",
        });
      }

      const runId = deps.get().activeAgentRunIdByTabId[tab.id];
      const run = runId ? deps.get().agentRuns[runId] : null;
      if (!run) {
        return unchangedSyncResult({
          reason: "no_active_run",
          message: "No active agent run is attached to this tab.",
        });
      }

      if (!run.terminalAttachmentId) {
        return unchangedSyncResult({
          reason: "no_runtime_run",
          message: "The active agent run has no native runtime id.",
        });
      }

      if (!SYNCABLE_AGENT_RUN_STATUSES.has(run.status)) {
        return unchangedSyncResult({
          reason: "terminal_run",
          message: "The active agent run is already finished.",
        });
      }

      try {
        const runtimeStatus = await runtime.getRunStatus(
          run.terminalAttachmentId,
        );
        if (runtimeStatus.status === "running") {
          deps.get().updateAgentRunStatus({
            runId: run.id,
            status: "running",
            output: runtimeStatus.output,
          });
          return {
            status: "synced",
            runId: run.id,
            runStatus: "running",
          };
        }

        if (runtimeStatus.status === "completed") {
          deps.get().updateAgentRunStatus({
            runId: run.id,
            status: "completed",
            output: runtimeStatus.output,
          });
          deps.showToast("Agent run completed");
          return {
            status: "synced",
            runId: run.id,
            runStatus: "completed",
          };
        }

        const message = failedRuntimeStatusMessage(runtimeStatus);
        deps.get().updateAgentRunStatus({
          runId: run.id,
          status: "failed",
          errorMessage: message,
          output: runtimeStatus.output,
        });
        deps.showToast("Agent run failed");
        return {
          status: "synced",
          runId: run.id,
          runStatus: "failed",
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Agent run status failed to sync";
        console.error("[agent-workflow] failed to sync agent run:", error);
        return unavailableSyncResult({
          reason: "runtime_status_failed",
          message,
        });
      }
    },
  };
}
