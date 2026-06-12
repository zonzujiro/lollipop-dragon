import type { AgentRun, AgentWorkflowState } from "./types";

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
