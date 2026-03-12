import { useAppStore } from "../store";
import { createDefaultTab } from "../types/tab";
import type { TabState } from "../types/tab";
import type { Comment } from "../types/criticmarkup";
import type { ShareRecord, PeerComment } from "../types/share";

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
  useAppStore.setState({
    tabs: [],
    activeTabId: null,
    theme: "light",
    focusMode: false,
    presentationMode: false,
    toast: null,
    isPeerMode: false,
    peerName: null,
    sharedContent: null,
    myPeerComments: [],
    submittedPeerCommentIds: [],
    peerShareKeys: {},
    peerActiveDocId: null,
    peerRawContent: "",
    peerFileName: null,
    peerActiveFilePath: null,
    peerResolvedComments: [],
    peerComments: [],
    peerCommentPanelOpen: false,
    history: [],
    historyDropdownOpen: false,
  });
}
