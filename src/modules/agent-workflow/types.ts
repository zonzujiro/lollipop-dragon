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

export interface AgentWorkflowControllerActions {
  startQuestionThreadAgentRun: () => Promise<AgentRunStartResult>;
}
