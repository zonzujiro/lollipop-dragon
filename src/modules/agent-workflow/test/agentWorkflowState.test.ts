import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../../store";
import { resetTestStore } from "../../../testing/testHelpers";
import {
  getActiveAgentRunForTab,
  getFinishedAgentRunHistoryForTab,
  hasActiveAgentRunForTab,
} from "../selectors";
import { hydrateAgentWorkflowState } from "../state";

beforeEach(() => {
  resetTestStore();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-12T18:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getPersistedStoreState(): Record<string, unknown> {
  const raw = localStorage.getItem("markreview-store");
  if (!raw) {
    throw new Error("Expected markreview-store to be persisted");
  }

  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || !isRecord(parsed["state"])) {
    throw new Error("Expected persisted store state object");
  }

  return parsed["state"];
}

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
      prompt: "",
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

  it("keeps finished prior runs as tab history", () => {
    const firstRun = useAppStore.getState().createAgentRun({
      tabId: "tab-1",
      taskKind: "address_comments",
      targetPaths: ["docs/first.md"],
      prompt: "Fix first",
    });
    useAppStore.getState().updateAgentRunStatus({
      runId: firstRun.id,
      status: "completed",
      output: "Done",
    });

    vi.setSystemTime(new Date("2026-06-12T18:02:00.000Z"));
    const secondRun = useAppStore.getState().createAgentRun({
      tabId: "tab-1",
      taskKind: "answer_questions",
      targetPaths: ["docs/second.md"],
      prompt: "Answer second",
    });

    const state = useAppStore.getState();
    expect(state.agentRuns[firstRun.id]).toMatchObject({
      id: firstRun.id,
      status: "completed",
      output: "Done",
    });
    expect(state.agentRuns[secondRun.id]).toEqual(secondRun);
    expect(state.activeAgentRunIdByTabId["tab-1"]).toBe(secondRun.id);
    expect(getFinishedAgentRunHistoryForTab(state, "tab-1")).toEqual([
      state.agentRuns[firstRun.id],
    ]);
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

  it("persists serializable run metadata", () => {
    localStorage.removeItem("markreview-store");
    const run = useAppStore.getState().createAgentRun({
      tabId: "tab-1",
      taskKind: "address_comments",
      targetPaths: ["docs/spec.md"],
      selectedCommentIds: ["comment-1"],
      prompt: "Fix comments",
      runnerKind: "terminal",
    });
    useAppStore.getState().updateAgentRunStatus({
      runId: run.id,
      status: "running",
      terminalAttachmentId: "native-run-1",
      output: "Started\n",
    });

    const persistedState = getPersistedStoreState();
    const agentRuns = persistedState["agentRuns"];
    const activeByTabId = persistedState["activeAgentRunIdByTabId"];
    if (!isRecord(agentRuns) || !isRecord(activeByTabId)) {
      throw new Error("Expected persisted agent workflow records");
    }

    expect(agentRuns[run.id]).toMatchObject({
      id: run.id,
      tabId: "tab-1",
      status: "running",
      terminalAttachmentId: "native-run-1",
      output: "Started\n",
    });
    expect(activeByTabId["tab-1"]).toBe(run.id);
  });

  it("hydrates persisted run metadata and active tab mapping", () => {
    const hydrated = hydrateAgentWorkflowState({
      agentRuns: {
        "run-1": {
          id: "run-1",
          tabId: "tab-1",
          status: "running",
          taskKind: "address_comments",
          targetPaths: ["docs/spec.md"],
          selectedCommentIds: ["comment-1"],
          prompt: "Fix comments",
          createdAt: "2026-06-12T18:00:00.000Z",
          completedAt: null,
          runnerKind: "terminal",
          terminalAttachmentId: "native-run-1",
          errorMessage: null,
          output: "Started\n",
        },
      },
      activeAgentRunIdByTabId: {
        "tab-1": "run-1",
      },
    });

    expect(hydrated.agentRuns["run-1"]).toMatchObject({
      id: "run-1",
      tabId: "tab-1",
      status: "running",
      terminalAttachmentId: "native-run-1",
      output: "Started\n",
    });
    expect(hydrated.activeAgentRunIdByTabId["tab-1"]).toBe("run-1");
  });

  it("drops malformed persisted runs and stale active tab mappings", () => {
    const hydrated = hydrateAgentWorkflowState({
      agentRuns: {
        "run-1": {
          id: "run-1",
          tabId: "tab-1",
          status: "running",
          taskKind: "address_comments",
          targetPaths: ["docs/spec.md"],
          selectedCommentIds: [],
          prompt: "Fix comments",
          createdAt: "2026-06-12T18:00:00.000Z",
          completedAt: null,
          runnerKind: "terminal",
          terminalAttachmentId: "native-run-1",
          errorMessage: null,
          output: "",
        },
        "run-2": {
          id: "run-2",
          tabId: "tab-2",
          status: "not-a-real-status",
          taskKind: "address_comments",
          targetPaths: ["docs/spec.md"],
          selectedCommentIds: [],
          prompt: "Fix comments",
          createdAt: "2026-06-12T18:00:00.000Z",
          completedAt: null,
          runnerKind: "terminal",
          terminalAttachmentId: "native-run-2",
          errorMessage: null,
          output: "",
        },
      },
      activeAgentRunIdByTabId: {
        "tab-1": "run-1",
        "tab-2": "run-2",
        "tab-3": "missing-run",
        "wrong-tab": "run-1",
      },
    });

    expect(Object.keys(hydrated.agentRuns)).toEqual(["run-1"]);
    expect(hydrated.activeAgentRunIdByTabId).toEqual({
      "tab-1": "run-1",
    });
  });
});
