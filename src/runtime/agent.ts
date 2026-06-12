import type {
  AgentRunTaskKind,
  AgentRunnerKind,
} from "../modules/agent-workflow";

export interface AgentRunRequest {
  tabId: string;
  taskKind: AgentRunTaskKind;
  targetPaths: string[];
  selectedCommentIds: string[];
  prompt: string;
  runnerKind: AgentRunnerKind | null;
}

export interface AgentRuntime {
  canRunAgent: boolean;
  startRun(request: AgentRunRequest): Promise<string>;
  stopRun(runId: string): Promise<void>;
}

export const webAgentRuntime: AgentRuntime = {
  canRunAgent: false,
  startRun: () =>
    Promise.reject(new Error("Local agent execution is unavailable on web")),
  stopRun: () => Promise.resolve(),
};
