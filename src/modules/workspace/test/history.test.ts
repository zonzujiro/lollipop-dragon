import { beforeEach, describe, it, expect, vi } from "vitest";
import { useAppStore } from "../../../store";
import {
  setTestState,
  resetTestStore,
  makeShare,
} from "../../../testing/testHelpers";
import type { HistoryEntry } from "../../../types/history";
import { getActiveTab } from "../selectors";
import { resetHandleStore } from "../storage";

function makeHistoryEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: crypto.randomUUID(),
    type: "file",
    name: "test.md",
    stableKey: "test.md",
    closedAt: new Date().toISOString(),
    activeFilePath: null,
    hasActiveShares: false,
    ...overrides,
  };
}

beforeEach(() => {
  resetTestStore();
  resetHandleStore();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("store.removeTab — history archival", () => {
  it("archives closed tab to history", () => {
    setTestState({ fileName: "doc.md" });
    const tabId = getActiveTab(useAppStore.getState())!.id;

    useAppStore.getState().removeTab(tabId);

    const { history } = useAppStore.getState();
    expect(history).toHaveLength(1);
    expect(history[0].name).toBe("doc.md");
    expect(history[0].type).toBe("file");
  });

  it("archives directory tab with correct type", () => {
    setTestState({ directoryName: "my-project", fileName: null });
    const tabId = getActiveTab(useAppStore.getState())!.id;

    useAppStore.getState().removeTab(tabId);

    const { history } = useAppStore.getState();
    expect(history).toHaveLength(1);
    expect(history[0].name).toBe("my-project");
    expect(history[0].type).toBe("directory");
  });

  it("records activeFilePath for directory tabs", () => {
    setTestState({
      directoryName: "project",
      fileName: null,
      activeFilePath: "docs/readme.md",
    });
    const tabId = getActiveTab(useAppStore.getState())!.id;

    useAppStore.getState().removeTab(tabId);

    expect(useAppStore.getState().history[0].activeFilePath).toBe(
      "docs/readme.md",
    );
  });

  it("records hasActiveShares when tab has active shares", () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    setTestState({
      fileName: "shared.md",
      shares: [makeShare({ expiresAt: futureDate })],
    });
    const tabId = getActiveTab(useAppStore.getState())!.id;

    useAppStore.getState().removeTab(tabId);

    expect(useAppStore.getState().history[0].hasActiveShares).toBe(true);
  });

  it("deduplicates by stableKey — keeps most recent", () => {
    // Close first tab
    setTestState({ fileName: "doc.md", workspaceId: "same-workspace" });
    const tab1Id = getActiveTab(useAppStore.getState())!.id;
    useAppStore.getState().removeTab(tab1Id);
    expect(useAppStore.getState().history).toHaveLength(1);
    const firstEntryId = useAppStore.getState().history[0].id;

    // Close second tab with same name
    setTestState({ fileName: "doc.md", workspaceId: "same-workspace" });
    const tab2Id = getActiveTab(useAppStore.getState())!.id;
    useAppStore.getState().removeTab(tab2Id);

    const { history } = useAppStore.getState();
    expect(history).toHaveLength(1);
    expect(history[0].id).not.toBe(firstEntryId);
  });

  it("keeps same-name workspaces distinct when their workspace identities differ", () => {
    setTestState({ fileName: "doc.md", workspaceId: "workspace-a" });
    useAppStore.getState().removeTab(getActiveTab(useAppStore.getState())!.id);

    setTestState({ fileName: "doc.md", workspaceId: "workspace-b" });
    useAppStore.getState().removeTab(getActiveTab(useAppStore.getState())!.id);

    expect(useAppStore.getState().history).toHaveLength(2);
  });

  it("enforces 20-entry limit", () => {
    for (let i = 0; i < 22; i++) {
      setTestState({ fileName: `file-${i}.md` });
      const tabId = getActiveTab(useAppStore.getState())!.id;
      useAppStore.getState().removeTab(tabId);
    }

    expect(useAppStore.getState().history).toHaveLength(20);
    // Most recent should be first
    expect(useAppStore.getState().history[0].name).toBe("file-21.md");
  });

  it("does not archive tab with no name", () => {
    setTestState({ fileName: null, directoryName: null });
    const tabId = getActiveTab(useAppStore.getState())!.id;

    useAppStore.getState().removeTab(tabId);

    expect(useAppStore.getState().history).toHaveLength(0);
  });

  it("does not close a tab with an active agent run", () => {
    setTestState({ fileName: "agent.md" });
    const tabId = getActiveTab(useAppStore.getState())!.id;
    const run = useAppStore.getState().createAgentRun({
      tabId,
      taskKind: "answer_questions",
      targetPaths: ["agent.md"],
      runnerKind: "terminal",
    });
    useAppStore.getState().updateAgentRunStatus({
      runId: run.id,
      status: "running",
      terminalAttachmentId: "native-run-1",
    });

    useAppStore.getState().removeTab(tabId);

    expect(useAppStore.getState().tabs.some((tab) => tab.id === tabId)).toBe(
      true,
    );
    expect(useAppStore.getState().history).toHaveLength(0);
    expect(useAppStore.getState().agentRuns[run.id]?.status).toBe("running");
    expect(useAppStore.getState().toast).toBe(
      "Stop the active agent run before closing this tab.",
    );
  });

  it("removes finished agent run metadata when closing its tab", () => {
    setTestState({ fileName: "agent.md" });
    const tabId = getActiveTab(useAppStore.getState())!.id;
    const run = useAppStore.getState().createAgentRun({
      tabId,
      taskKind: "answer_questions",
      targetPaths: ["agent.md"],
      runnerKind: "terminal",
    });
    useAppStore.getState().updateAgentRunStatus({
      runId: run.id,
      status: "completed",
    });

    useAppStore.getState().removeTab(tabId);

    expect(useAppStore.getState().tabs.some((tab) => tab.id === tabId)).toBe(
      false,
    );
    expect(useAppStore.getState().agentRuns[run.id]).toBeUndefined();
    expect(
      useAppStore.getState().activeAgentRunIdByTabId[tabId],
    ).toBeUndefined();
  });
});

describe("store.removeHistoryEntry", () => {
  it("removes a specific entry", () => {
    const entry = makeHistoryEntry({ name: "keep.md" });
    const toRemove = makeHistoryEntry({ name: "remove.md" });
    useAppStore.setState({ history: [entry, toRemove] });

    useAppStore.getState().removeHistoryEntry(toRemove.id);

    const { history } = useAppStore.getState();
    expect(history).toHaveLength(1);
    expect(history[0].name).toBe("keep.md");
  });
});

describe("store.clearHistory", () => {
  it("removes all entries", () => {
    useAppStore.setState({
      history: [makeHistoryEntry(), makeHistoryEntry({ name: "b.md" })],
    });

    useAppStore.getState().clearHistory();

    expect(useAppStore.getState().history).toHaveLength(0);
  });
});

describe("store.toggleHistoryDropdown", () => {
  it("toggles dropdown open/closed", () => {
    expect(useAppStore.getState().historyDropdownOpen).toBe(false);
    useAppStore.getState().toggleHistoryDropdown();
    expect(useAppStore.getState().historyDropdownOpen).toBe(true);
    useAppStore.getState().toggleHistoryDropdown();
    expect(useAppStore.getState().historyDropdownOpen).toBe(false);
  });
});

describe("history localStorage persistence", () => {
  it("persists history to localStorage on removeTab", () => {
    setTestState({ fileName: "persisted.md" });
    const tabId = getActiveTab(useAppStore.getState())!.id;

    useAppStore.getState().removeTab(tabId);

    const stored = JSON.parse(
      localStorage.getItem("markreview-history") ?? "[]",
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("persisted.md");
  });

  it("clears localStorage on clearHistory", () => {
    localStorage.setItem(
      "markreview-history",
      JSON.stringify([makeHistoryEntry()]),
    );
    useAppStore.setState({ history: [makeHistoryEntry()] });

    useAppStore.getState().clearHistory();

    const stored = JSON.parse(
      localStorage.getItem("markreview-history") ?? "[]",
    );
    expect(stored).toHaveLength(0);
  });
});
