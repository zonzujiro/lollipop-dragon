import { useAppStore } from "../store";
import { createDefaultTab } from "../types/tab";
import type { TabState } from "../types/tab";

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
 * Reset the store to a clean state for tests.
 */
export function resetTestStore() {
  useAppStore.setState({
    tabs: [],
    activeTabId: null,
    theme: "light",
    focusMode: false,
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
  });
}
