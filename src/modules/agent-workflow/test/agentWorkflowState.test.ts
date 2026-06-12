import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../../store";
import { resetTestStore } from "../../../testing/testHelpers";
import { getActiveAgentRunForTab, hasActiveAgentRunForTab } from "../selectors";

beforeEach(() => {
  resetTestStore();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-12T18:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("agent workflow state", () => {
  it("creates a queued run scoped to one tab", () => {
    const run = useAppStore.getState().createAgentRun({
      tabId: "tab-1",
      taskKind: "address_comments",
      targetPaths: ["docs/spec.md"],
      selectedCommentIds: ["comment-1"],
      runnerKind: "terminal",
    });

    const state = useAppStore.getState();
    expect(run).toMatchObject({
      tabId: "tab-1",
      status: "queued",
      taskKind: "address_comments",
      targetPaths: ["docs/spec.md"],
      selectedCommentIds: ["comment-1"],
      createdAt: "2026-06-12T18:00:00.000Z",
      completedAt: null,
      runnerKind: "terminal",
      terminalAttachmentId: null,
      errorMessage: null,
      output: "",
    });
    expect(state.agentRuns[run.id]).toEqual(run);
    expect(state.activeAgentRunIdByTabId["tab-1"]).toBe(run.id);
    expect(getActiveAgentRunForTab(state, "tab-1")).toEqual(run);
    expect(hasActiveAgentRunForTab(state, "tab-1")).toBe(true);
  });

  it("marks terminal statuses as completed", () => {
    const run = useAppStore.getState().createAgentRun({
      tabId: "tab-1",
      taskKind: "answer_questions",
      targetPaths: ["docs/spec.md"],
    });

    vi.setSystemTime(new Date("2026-06-12T18:01:00.000Z"));
    useAppStore.getState().updateAgentRunStatus({
      runId: run.id,
      status: "failed",
      errorMessage: "Agent unavailable",
      output: "Failure log",
    });

    const updatedRun = useAppStore.getState().agentRuns[run.id];
    expect(updatedRun?.status).toBe("failed");
    expect(updatedRun?.completedAt).toBe("2026-06-12T18:01:00.000Z");
    expect(updatedRun?.errorMessage).toBe("Agent unavailable");
    expect(updatedRun?.output).toBe("Failure log");
    expect(hasActiveAgentRunForTab(useAppStore.getState(), "tab-1")).toBe(
      false,
    );
  });

  it("replaces the active run for the same tab", () => {
    const firstRun = useAppStore.getState().createAgentRun({
      tabId: "tab-1",
      taskKind: "address_comments",
      targetPaths: ["docs/first.md"],
    });
    const secondRun = useAppStore.getState().createAgentRun({
      tabId: "tab-1",
      taskKind: "answer_questions",
      targetPaths: ["docs/second.md"],
    });

    const state = useAppStore.getState();
    expect(state.agentRuns[firstRun.id]).toBeUndefined();
    expect(state.agentRuns[secondRun.id]).toEqual(secondRun);
    expect(state.activeAgentRunIdByTabId["tab-1"]).toBe(secondRun.id);
  });

  it("clears the active run for a tab", () => {
    const run = useAppStore.getState().createAgentRun({
      tabId: "tab-1",
      taskKind: "review_peer_comments",
      targetPaths: ["docs/spec.md"],
    });

    useAppStore.getState().clearTabAgentRun("tab-1");

    const state = useAppStore.getState();
    expect(state.agentRuns[run.id]).toBeUndefined();
    expect(state.activeAgentRunIdByTabId["tab-1"]).toBeUndefined();
  });
});
