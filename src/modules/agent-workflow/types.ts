export type AgentRunStatus =
  | "queued"
  | "running"
  | "needs_attention"
  | "completed"
  | "failed"
  | "stopped";

export type AgentRunTaskKind =
  | "address_comments"
  | "answer_questions"
  | "review_peer_comments";

export type AgentRunnerKind = "terminal" | "codex_app_server";

export interface AgentRun {
  id: string;
  tabId: string;
  status: AgentRunStatus;
  taskKind: AgentRunTaskKind;
  targetPaths: string[];
  selectedCommentIds: string[];
  createdAt: string;
  completedAt: string | null;
  runnerKind: AgentRunnerKind | null;
  terminalAttachmentId: string | null;
  errorMessage: string | null;
  output: string;
}

export interface CreateAgentRunInput {
  tabId: string;
  taskKind: AgentRunTaskKind;
  targetPaths: string[];
  selectedCommentIds?: string[];
  runnerKind?: AgentRunnerKind | null;
}

export interface UpdateAgentRunStatusInput {
  runId: string;
  status: AgentRunStatus;
  errorMessage?: string | null;
  terminalAttachmentId?: string | null;
  output?: string;
}

export interface AgentWorkflowState {
  agentRuns: Record<string, AgentRun>;
  activeAgentRunIdByTabId: Record<string, string>;
}

export interface AgentWorkflowActions {
  createAgentRun: (input: CreateAgentRunInput) => AgentRun;
  updateAgentRunStatus: (input: UpdateAgentRunStatusInput) => void;
  clearAgentRun: (runId: string) => void;
  clearTabAgentRun: (tabId: string) => void;
}

export type AgentRunStartUnavailableReason =
  | "agent_unavailable"
  | "no_active_tab"
  | "no_active_file"
  | "no_addressable_comments"
  | "no_question_threads";

export type AgentRunStartResult =
  | {
      status: "started";
      run: AgentRun;
      runtimeRunId: string;
    }
  | {
      status: "unavailable";
      reason: AgentRunStartUnavailableReason;
      message: string;
    };

export type AgentRunStopUnavailableReason =
  | "no_active_tab"
  | "no_active_run"
  | "runtime_stop_failed";

export type AgentRunStopResult =
  | {
      status: "stopped";
      runId: string;
    }
  | {
      status: "unavailable";
      reason: AgentRunStopUnavailableReason;
      message: string;
    };

export type AgentRunSyncStatusUnavailableReason =
  | "no_active_tab"
  | "no_active_run"
  | "no_runtime_run"
  | "terminal_run"
  | "runtime_status_failed";

export type AgentRunSyncStatusResult =
  | {
      status: "synced";
      runId: string;
      runStatus: AgentRunStatus;
    }
  | {
      status: "unchanged";
      reason: AgentRunSyncStatusUnavailableReason;
      message: string;
    }
  | {
      status: "unavailable";
      reason: AgentRunSyncStatusUnavailableReason;
      message: string;
    };

export interface AgentWorkflowControllerActions {
  startAddressCommentsAgentRun: () => Promise<AgentRunStartResult>;
  startQuestionThreadAgentRun: () => Promise<AgentRunStartResult>;
  stopActiveAgentRun: () => Promise<AgentRunStopResult>;
  syncActiveAgentRunStatus: () => Promise<AgentRunSyncStatusResult>;
}
