import type { AgentRun, AgentWorkflowState } from "./types";

const FINISHED_AGENT_RUN_STATUSES = new Set<AgentRun["status"]>([
  "completed",
  "failed",
  "stopped",
]);

function compareAgentRunsNewestFirst(runA: AgentRun, runB: AgentRun): number {
  const createdAtComparison = runB.createdAt.localeCompare(runA.createdAt);
  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }
  return runB.id.localeCompare(runA.id);
}

export function getAgentRun(
  state: AgentWorkflowState,
  runId: string,
): AgentRun | null {
  return state.agentRuns[runId] ?? null;
}

export function getActiveAgentRunForTab(
  state: AgentWorkflowState,
  tabId: string,
): AgentRun | null {
  const runId = state.activeAgentRunIdByTabId[tabId];
  if (!runId) {
    return null;
  }
  return getAgentRun(state, runId);
}

export function hasActiveAgentRunForTab(
  state: AgentWorkflowState,
  tabId: string,
): boolean {
  const run = getActiveAgentRunForTab(state, tabId);
  return Boolean(
    run &&
    (run.status === "queued" ||
      run.status === "running" ||
      run.status === "needs_attention"),
  );
}

export function getAgentRunsForTab(
  state: AgentWorkflowState,
  tabId: string,
): AgentRun[] {
  return Object.values(state.agentRuns)
    .filter((run) => run.tabId === tabId)
    .sort(compareAgentRunsNewestFirst);
}

export function getFinishedAgentRunHistoryForTab(
  state: AgentWorkflowState,
  tabId: string,
): AgentRun[] {
  return getAgentRunsForTab(state, tabId).filter((run) =>
    FINISHED_AGENT_RUN_STATUSES.has(run.status),
  );
}
