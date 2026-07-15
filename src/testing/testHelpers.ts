import { useAppStore } from "../store";
import { createAgentWorkflowState } from "../modules/agent-workflow";
import { createAppShellState } from "../modules/app-shell";
import { createPeerReviewState } from "../modules/peer-review";
import { createRelayState } from "../modules/relay";
import { createDefaultTab } from "../types/tab";
import type { TabState } from "../types/tab";
import type { Comment } from "../types/criticmarkup";
import type { ShareRecord, PeerComment } from "../types/share";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFunctionProperty(
  value: Record<string, unknown>,
  propertyName: string,
): boolean {
  return typeof value[propertyName] === "function";
}

function isFileSystemFileHandle(value: unknown): value is FileSystemFileHandle {
  return !isRecord(value) ||
    value.kind !== "file" ||
    typeof value.name !== "string" ||
    !isFunctionProperty(value, "getFile") ||
    !isFunctionProperty(value, "createWritable") ||
    !isFunctionProperty(value, "isSameEntry")
    ? false
    : true;
}

export function requireFileSystemFileHandle(
  value: unknown,
): FileSystemFileHandle {
  if (!isFileSystemFileHandle(value)) {
    throw new Error("Invalid mock file handle");
  }
  return value;
}

export function makeTestFileHandle(
  overrides: Record<string, unknown> = {},
): FileSystemFileHandle {
  return requireFileSystemFileHandle({
    kind: "file",
    name: "test.md",
    getFile: () => Promise.resolve(new File([], "test.md")),
    createWritable: () => Promise.reject(new Error("Writable not configured")),
    isSameEntry: () => Promise.resolve(false),
    ...overrides,
  });
}

function isFileSystemDirectoryHandle(
  value: unknown,
): value is FileSystemDirectoryHandle {
  return !(
    !isRecord(value) ||
    value.kind !== "directory" ||
    typeof value.name !== "string" ||
    !isFunctionProperty(value, "getDirectoryHandle") ||
    !isFunctionProperty(value, "getFileHandle") ||
    !isFunctionProperty(value, "removeEntry") ||
    !isFunctionProperty(value, "resolve") ||
    !isFunctionProperty(value, "isSameEntry")
  );
}

export function requireFileSystemDirectoryHandle(
  value: unknown,
): FileSystemDirectoryHandle {
  if (!isFileSystemDirectoryHandle(value)) {
    throw new Error("Invalid mock directory handle");
  }
  return value;
}

export function makeTestDirectoryHandle(
  overrides: Record<string, unknown> = {},
): FileSystemDirectoryHandle {
  return requireFileSystemDirectoryHandle({
    kind: "directory",
    name: "test-directory",
    getDirectoryHandle: () =>
      Promise.reject(new Error("Directory lookup not configured")),
    getFileHandle: () =>
      Promise.reject(new Error("File lookup not configured")),
    removeEntry: () => Promise.resolve(),
    resolve: () => Promise.resolve(null),
    isSameEntry: () => Promise.resolve(false),
    async *values() {},
    ...overrides,
  });
}

/**
 * Set tab-scoped state for tests. Creates a tab from the provided fields
 * and sets it as the active tab, while also setting any global fields.
 */
export function setTestState(
  tabFields: Partial<TabState>,
  globalFields?: Record<string, unknown>,
) {
  const tabId = "test-tab";
  const existing = useAppStore.getState().tabs.find((t) => t.id === tabId);
  const tab = existing
    ? { ...existing, ...tabFields }
    : createDefaultTab({ label: "test", ...tabFields, id: tabId });
  // Replace or add the test tab
  const tabs = useAppStore
    .getState()
    .tabs.filter((t) => t.id !== tabId)
    .concat(tab);
  useAppStore.setState({
    tabs,
    activeTabId: tabId,
    ...globalFields,
  });
}

/**
 * Build a Comment with sensible defaults. Every field can be overridden.
 */
export function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "0",
    criticType: "comment",
    type: "note",
    text: "test comment",
    raw: "{>>test comment<<}",
    rawStart: 0,
    rawEnd: 18,
    cleanStart: 0,
    cleanEnd: 0,
    ...overrides,
  };
}

/**
 * Build a ShareRecord with sensible defaults. Every field can be overridden.
 */
export function makeShare(overrides: Partial<ShareRecord> = {}): ShareRecord {
  return {
    docId: "doc-1",
    hostSecret: "secret",
    label: "my-doc",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    pendingCommentCount: 0,
    keyB64: "test-key",
    fileCount: 1,
    ...overrides,
  };
}

/**
 * Build a PeerComment with sensible defaults. Every field can be overridden.
 */
export function makePeerComment(
  overrides: Partial<PeerComment> = {},
): PeerComment {
  return {
    id: "cmt-1",
    peerName: "Alice",
    path: "readme.md",
    blockRef: { blockIndex: 0, contentPreview: "Some text" },
    commentType: "note",
    text: "A comment",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Reset the store to a clean state for tests.
 */
export function resetTestStore() {
  const appShellState = createAppShellState();
  const agentWorkflowState = createAgentWorkflowState();
  const peerReviewState = createPeerReviewState();
  const relayState = createRelayState();
  useAppStore.setState({
    tabs: [],
    activeTabId: null,
    ...appShellState,
    ...agentWorkflowState,
    ...peerReviewState,
    history: [],
    historyDropdownOpen: false,
    ...relayState,
  });
}
