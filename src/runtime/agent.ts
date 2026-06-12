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
  workspaceRootPath: string | null;
}

export type AgentRuntimeRunStatus =
  | {
      status: "running";
    }
  | {
      status: "completed";
      exitCode: number | null;
    }
  | {
      status: "failed";
      exitCode: number | null;
      message: string;
    }
  | {
      status: "not_found";
      message: string;
    };

export interface AgentRuntime {
  canRunAgent: boolean;
  startRun(request: AgentRunRequest): Promise<string>;
  stopRun(runId: string): Promise<void>;
  getRunStatus(runId: string): Promise<AgentRuntimeRunStatus>;
}

export const webAgentRuntime: AgentRuntime = {
  canRunAgent: false,
  startRun: () =>
    Promise.reject(new Error("Local agent execution is unavailable on web")),
  stopRun: () => Promise.resolve(),
  getRunStatus: () =>
    Promise.resolve({
      status: "not_found",
      message: "Local agent execution is unavailable on web",
    }),
};
