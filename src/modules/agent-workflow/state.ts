import type { StoreApi } from "zustand";
import type {
  AgentRun,
  AgentRunStatus,
  AgentWorkflowActions,
  AgentWorkflowState,
} from "./types";

type SetState<StoreState> = StoreApi<StoreState>["setState"];

const TERMINAL_STATUSES = new Set<AgentRunStatus>([
  "completed",
  "failed",
  "stopped",
]);

export function createAgentWorkflowState(): AgentWorkflowState {
  return {
    agentRuns: {},
    activeAgentRunIdByTabId: {},
  };
}

function createRunId(): string {
  return crypto.randomUUID();
}

function isTerminalAgentRunStatus(status: AgentRunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

function createRun(input: {
  id: string;
  tabId: string;
  taskKind: AgentRun["taskKind"];
  targetPaths: string[];
  selectedCommentIds: string[];
  prompt: string;
  runnerKind: AgentRun["runnerKind"];
  createdAt: string;
}): AgentRun {
  return {
    id: input.id,
    tabId: input.tabId,
    status: "queued",
    taskKind: input.taskKind,
    targetPaths: input.targetPaths,
    selectedCommentIds: input.selectedCommentIds,
    prompt: input.prompt,
    createdAt: input.createdAt,
    completedAt: null,
    runnerKind: input.runnerKind,
    terminalAttachmentId: null,
    errorMessage: null,
    output: "",
  };
}

export function createAgentWorkflowActions<
  StoreState extends AgentWorkflowState,
>(set: SetState<StoreState>): AgentWorkflowActions {
  return {
    createAgentRun: (input) => {
      const run = createRun({
        id: createRunId(),
        tabId: input.tabId,
        taskKind: input.taskKind,
        targetPaths: [...input.targetPaths],
        selectedCommentIds: [...(input.selectedCommentIds ?? [])],
        prompt: input.prompt ?? "",
        runnerKind: input.runnerKind ?? null,
        createdAt: new Date().toISOString(),
      });

      set((state) => {
        const previousRunId = state.activeAgentRunIdByTabId[run.tabId];
        const nextRuns = { ...state.agentRuns };
        if (previousRunId) {
          delete nextRuns[previousRunId];
        }
        nextRuns[run.id] = run;

        return {
          agentRuns: nextRuns,
          activeAgentRunIdByTabId: {
            ...state.activeAgentRunIdByTabId,
            [run.tabId]: run.id,
          },
        };
      });

      return run;
    },

    updateAgentRunStatus: (input) => {
      set((state) => {
        const run = state.agentRuns[input.runId];
        if (!run) {
          return {};
        }

        const updatedRun: AgentRun = {
          ...run,
          status: input.status,
          completedAt: isTerminalAgentRunStatus(input.status)
            ? new Date().toISOString()
            : run.completedAt,
          errorMessage:
            input.errorMessage !== undefined
              ? input.errorMessage
              : run.errorMessage,
          terminalAttachmentId:
            input.terminalAttachmentId !== undefined
              ? input.terminalAttachmentId
              : run.terminalAttachmentId,
          output:
            input.output !== undefined ? input.output : (run.output ?? ""),
        };

        return {
          agentRuns: {
            ...state.agentRuns,
            [input.runId]: updatedRun,
          },
        };
      });
    },

    clearAgentRun: (runId) => {
      set((state) => {
        const run = state.agentRuns[runId];
        if (!run) {
          return {};
        }

        const nextRuns = { ...state.agentRuns };
        delete nextRuns[runId];
        const nextActiveByTab = { ...state.activeAgentRunIdByTabId };
        if (nextActiveByTab[run.tabId] === runId) {
          delete nextActiveByTab[run.tabId];
        }

        return {
          agentRuns: nextRuns,
          activeAgentRunIdByTabId: nextActiveByTab,
        };
      });
    },

    clearTabAgentRun: (tabId) => {
      set((state) => {
        const runId = state.activeAgentRunIdByTabId[tabId];
        if (!runId) {
          return {};
        }

        const nextRuns = { ...state.agentRuns };
        delete nextRuns[runId];
        const nextActiveByTab = { ...state.activeAgentRunIdByTabId };
        delete nextActiveByTab[tabId];

        return {
          agentRuns: nextRuns,
          activeAgentRunIdByTabId: nextActiveByTab,
        };
      });
    },
  };
}
