import type { StoreApi } from "zustand";
import type {
  AgentRun,
  AgentRunTaskKind,
  AgentRunnerKind,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isAgentRunStatus(value: unknown): value is AgentRunStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "needs_attention" ||
    value === "completed" ||
    value === "failed" ||
    value === "stopped"
  );
}

function isAgentRunTaskKind(value: unknown): value is AgentRunTaskKind {
  return (
    value === "address_comments" ||
    value === "answer_questions" ||
    value === "review_peer_comments"
  );
}

function isAgentRunnerKind(value: unknown): value is AgentRunnerKind {
  return value === "terminal" || value === "codex_app_server";
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return undefined;
}

function hydrateAgentRun(value: unknown): AgentRun | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = value["id"];
  const tabId = value["tabId"];
  const status = value["status"];
  const taskKind = value["taskKind"];
  const targetPaths = value["targetPaths"];
  const selectedCommentIds = value["selectedCommentIds"];
  const prompt = value["prompt"];
  const createdAt = value["createdAt"];
  const completedAt = nullableString(value["completedAt"]);
  const runnerKind = nullableString(value["runnerKind"]);
  const terminalAttachmentId = nullableString(value["terminalAttachmentId"]);
  const errorMessage = nullableString(value["errorMessage"]);
  const output = value["output"];

  if (
    typeof id !== "string" ||
    typeof tabId !== "string" ||
    !isAgentRunStatus(status) ||
    !isAgentRunTaskKind(taskKind) ||
    !isStringArray(targetPaths) ||
    !isStringArray(selectedCommentIds) ||
    typeof prompt !== "string" ||
    typeof createdAt !== "string" ||
    completedAt === undefined ||
    runnerKind === undefined ||
    terminalAttachmentId === undefined ||
    errorMessage === undefined ||
    typeof output !== "string"
  ) {
    return null;
  }

  if (runnerKind !== null && !isAgentRunnerKind(runnerKind)) {
    return null;
  }

  return {
    id,
    tabId,
    status,
    taskKind,
    targetPaths,
    selectedCommentIds,
    prompt,
    createdAt,
    completedAt,
    runnerKind,
    terminalAttachmentId,
    errorMessage,
    output,
  };
}

function hydrateAgentRuns(value: unknown): Record<string, AgentRun> {
  if (!isRecord(value)) {
    return {};
  }

  const runs: Record<string, AgentRun> = {};
  for (const runValue of Object.values(value)) {
    const run = hydrateAgentRun(runValue);
    if (run) {
      runs[run.id] = run;
    }
  }
  return runs;
}

function hydrateActiveRunMap(
  value: unknown,
  agentRuns: Record<string, AgentRun>,
): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  const activeByTabId: Record<string, string> = {};
  for (const [tabId, runId] of Object.entries(value)) {
    if (typeof runId !== "string") {
      continue;
    }
    const run = agentRuns[runId];
    if (run?.tabId === tabId) {
      activeByTabId[tabId] = runId;
    }
  }
  return activeByTabId;
}

export function hydrateAgentWorkflowState(value: unknown): AgentWorkflowState {
  if (!isRecord(value)) {
    return createAgentWorkflowState();
  }

  const agentRuns = hydrateAgentRuns(value["agentRuns"]);
  return {
    agentRuns,
    activeAgentRunIdByTabId: hydrateActiveRunMap(
      value["activeAgentRunIdByTabId"],
      agentRuns,
    ),
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
