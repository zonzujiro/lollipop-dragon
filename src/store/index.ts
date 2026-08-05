import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  createAgentWorkflowActions,
  createAgentWorkflowControllerActions,
  createAgentWorkflowState,
  hydrateAgentWorkflowState,
} from "../modules/agent-workflow";
import type {
  AgentWorkflowActions,
  AgentWorkflowControllerActions,
  AgentWorkflowState,
} from "../modules/agent-workflow";
import {
  createAppShellActions,
  createAppShellState,
} from "../modules/app-shell";
import type {
  AppShellActions,
  AppShellState,
  AppTheme,
} from "../modules/app-shell";
import {
  createHostReviewActions,
  createHostReviewControllerActions,
} from "../modules/host-review";
import type { HostReviewActions } from "../modules/host-review";
import {
  createPeerReviewActions,
  createPeerReviewControllerActions,
  createPeerReviewState,
} from "../modules/peer-review";
import type {
  PeerReviewActions,
  PeerReviewState,
} from "../modules/peer-review";
import { createRelayActions, createRelayState } from "../modules/relay/state";
import { configureRelayApplicationPort } from "../modules/relay/applicationPort";
import type { RelayActions, RelayState } from "../modules/relay/types";
import {
  createSharingActions,
  createSharingControllerActions,
} from "../modules/sharing";
import type { SharingActions } from "../modules/sharing";
import { syncActiveShares as syncActiveSharesService } from "../modules/sharing/sync";
import {
  buildUpdatedActiveTabs,
  buildUpdatedTabs,
  createWorkspaceActions,
  createWorkspaceControllerActions,
  createWorkspaceState,
  getActiveTab as getWorkspaceActiveTab,
  getLiveFileTree,
  loadWorkspaceHistory,
  loadWorkspaceContent,
  saveWorkspaceContent,
} from "../modules/workspace";
import type { WorkspaceActions, WorkspaceState } from "../modules/workspace";
import { toPersistedTree } from "../types/fileTree";
import { isNativeDirectoryTarget, isNativeFileTarget } from "../types/fileTree";
import type {
  HydratedSidebarTreeNode,
  NativeDirectoryTarget,
  NativeFileTarget,
  SidebarTreeNode,
} from "../types/fileTree";
import type { CommentType } from "../types/criticmarkup";
import type { TabState } from "../types/tab";
import { createDefaultTab } from "../types/tab";
import { isShareRecordArray } from "../types/share";
import type { ShareRecord } from "../types/share";

const SHARES_KEY = "markreview-shares";

const safeLocalStorage = {
  getItem: (name: string): string | null => {
    try {
      return localStorage.getItem(name);
    } catch (error) {
      console.warn("[store] failed to read persisted state:", error);
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(name, value);
    } catch (error) {
      console.warn("[store] failed to persist state:", error);
    }
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name);
    } catch (error) {
      console.warn("[store] failed to remove persisted state:", error);
    }
  },
};

interface AppState
  extends
    AgentWorkflowState,
    AgentWorkflowActions,
    AgentWorkflowControllerActions,
    AppShellState,
    AppShellActions,
    WorkspaceState,
    WorkspaceActions,
    RelayState,
    RelayActions,
    PeerReviewState,
    PeerReviewActions,
    HostReviewActions,
    SharingActions {
  // Block highlight (transient UI state for comment hover)
  hoveredBlockHighlight: {
    blockIndex: number;
    commentType: CommentType;
    commentId?: string;
  } | null;
  setHoveredBlockHighlight: (
    highlight: {
      blockIndex: number;
      commentType: CommentType;
      commentId?: string;
    } | null,
  ) => void;
}

function activeTab(get: () => AppState): TabState | null {
  return getWorkspaceActiveTab(get());
}

function getPersistedTabFileTree(
  tab: TabState & { sidebarTree?: SidebarTreeNode[] },
): HydratedSidebarTreeNode[] {
  if (Array.isArray(tab.fileTree)) {
    return tab.fileTree;
  }
  if (Array.isArray(tab.sidebarTree)) {
    return tab.sidebarTree;
  }
  return [];
}

// Persistence migration: detect old flat format and convert
interface OldPersistedState {
  fileName?: string | null;
  rawContent?: string;
  theme?: AppTheme;
  sidebarOpen?: boolean;
  activeFilePath?: string | null;
  directoryName?: string | null;
  peerName?: string | null;
}

function getPersistedNativeFileTarget(tab: TabState): NativeFileTarget | null {
  return tab.fileHandle && isNativeFileTarget(tab.fileHandle)
    ? tab.fileHandle
    : null;
}

function getPersistedNativeDirectoryTarget(
  tab: TabState,
): NativeDirectoryTarget | null {
  return tab.directoryHandle && isNativeDirectoryTarget(tab.directoryHandle)
    ? tab.directoryHandle
    : null;
}

function isOldFormat(p: unknown): p is OldPersistedState {
  return (
    typeof p === "object" &&
    p !== null &&
    !("tabs" in p) &&
    ("fileName" in p || "rawContent" in p || "theme" in p)
  );
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const appShellActions = createAppShellActions(set);
      const workspaceActions = createWorkspaceActions({
        set,
        buildUpdatedActiveTabs,
      });
      let scanAllFileComments: () => Promise<void> = async () => {};
      const workspaceControllerActions = createWorkspaceControllerActions({
        set,
        get,
        scanAllFileComments: () => scanAllFileComments(),
        showToast: appShellActions.showToast,
        syncActiveShares: () => {
          void syncActiveSharesService(get());
        },
      });
      const hostReviewActions = createHostReviewActions({
        set,
        get,
        getActiveTab: activeTab,
        buildUpdatedActiveTabs,
      });
      const hostReviewControllerActions = createHostReviewControllerActions({
        set,
        get,
        selectFile: workspaceControllerActions.selectFile,
        getActiveTab: activeTab,
        buildUpdatedTabs,
        buildUpdatedActiveTabs,
        getLiveFileTree,
      });
      scanAllFileComments = hostReviewControllerActions.scanAllFileComments;
      const sharingActions = createSharingActions({
        set,
        get,
        buildUpdatedTabs,
        buildUpdatedActiveTabs,
      });
      const sharingControllerActions = createSharingControllerActions({
        set,
        get,
        queuePendingResolve: sharingActions.queuePendingResolve,
        getActiveTab: activeTab,
        buildUpdatedTabs,
        buildUpdatedActiveTabs,
        getLiveFileTree,
      });
      const peerReviewActions = createPeerReviewActions(set, get);
      const peerReviewControllerActions = createPeerReviewControllerActions(
        set,
        get,
      );
      const relayActions = createRelayActions(set);
      const agentWorkflowActions = createAgentWorkflowActions(set);
      const agentWorkflowControllerActions =
        createAgentWorkflowControllerActions({
          get,
          getActiveTab: activeTab,
          showToast: appShellActions.showToast,
        });

      return {
        ...createWorkspaceState(loadWorkspaceHistory()),
        ...createAgentWorkflowState(),
        ...createAppShellState(),
        ...createRelayState(),
        ...createPeerReviewState(),

        hoveredBlockHighlight: null,
        setHoveredBlockHighlight: (highlight) =>
          set({ hoveredBlockHighlight: highlight }),

        ...workspaceActions,
        ...workspaceControllerActions,

        // ── Agent workflow metadata ───────────────────────────────────────
        ...agentWorkflowActions,
        ...agentWorkflowControllerActions,

        // ── Tab-scoped actions ──────────────────────────────────────────────
        ...hostReviewActions,
        ...hostReviewControllerActions,

        // ── Global actions ────────────────────────────────────────────────
        ...appShellActions,

        // ── Sharing actions (tab-scoped) ──────────────────────────────────
        ...sharingActions,
        ...sharingControllerActions,

        // ── Peer actions ──────────────────────────────────────────────────
        ...peerReviewActions,
        ...peerReviewControllerActions,

        // ── Realtime comment actions ──────────────────────────────────────────
        ...relayActions,
      };
    },
    {
      name: "markreview-store",
      storage: createJSONStorage(() => safeLocalStorage),
      version: 3,
      migrate: (persisted, version) => {
        if (version === 0 || version === 1) {
          // Old flat format → wrap into single tab
          if (isOldFormat(persisted)) {
            const hasContent = !!(
              persisted.fileName || persisted.directoryName
            );
            const tabId = crypto.randomUUID();
            const tabs: TabState[] = hasContent
              ? [
                  {
                    id: tabId,
                    workspaceId: crypto.randomUUID(),
                    label:
                      persisted.directoryName ??
                      persisted.fileName ??
                      "document",
                    fileHandle: null,
                    fileName: persisted.fileName ?? null,
                    rawContent: persisted.rawContent ?? "",
                    directoryHandle: null,
                    directoryName: persisted.directoryName ?? null,
                    fileTree: [],
                    activeFilePath: persisted.activeFilePath ?? null,
                    sidebarOpen: persisted.sidebarOpen ?? true,
                    comments: [],
                    resolvedComments: [],
                    activeCommentId: null,
                    commentPanelOpen: false,
                    commentFilter: "all",
                    allFileComments: {},
                    pendingScrollTarget: null,
                    writeAllowed: true,
                    undoState: null,
                    shares: [],
                    sharedPanelOpen: false,
                    pendingComments: {},
                    shareKeys: {},
                    activeDocId: null,
                    pendingResolveCommentIds: {},
                    incomingReviewSessions: {},
                    restoreError: null,
                  },
                ]
              : [];

            // Migrate old shares to the new tab
            try {
              const oldRaw = localStorage.getItem(SHARES_KEY);
              if (oldRaw && tabs.length > 0) {
                const oldShares: unknown = JSON.parse(oldRaw);
                if (isShareRecordArray(oldShares)) {
                  const allShares: Record<string, ShareRecord[]> = {
                    [tabId]: oldShares,
                  };
                  localStorage.setItem(SHARES_KEY, JSON.stringify(allShares));
                  const firstTab = tabs[0];
                  if (firstTab) {
                    firstTab.shares = oldShares;
                  }
                }
              }
            } catch (error) {
              console.error("[migrate] failed to migrate shares:", error);
            }

            // Migrate old IndexedDB handle key
            // (this is async but we can't await in migrate — restoreTabs will handle it)
            const peerReviewDefaults = createPeerReviewState();

            return {
              tabs,
              activeTabId: tabs[0]?.id ?? null,
              theme: persisted.theme ?? "light",
              // Defaults for other global fields
              focusMode: false,
              toast: null,
              ...peerReviewDefaults,
              peerName: persisted.peerName ?? peerReviewDefaults.peerName,
            };
          }
        }
        return persisted;
      },
      partialize: (s) => ({
        tabs: s.tabs.map((t) => ({
          id: t.id,
          workspaceId: t.workspaceId,
          label: t.label,
          fileHandle: getPersistedNativeFileTarget(t),
          fileName: t.fileName,
          directoryHandle: getPersistedNativeDirectoryTarget(t),
          directoryName: t.directoryName,
          activeFilePath: t.activeFilePath,
          fileTree: toPersistedTree(t.fileTree),
          sidebarOpen: t.sidebarOpen,
          commentPanelOpen: t.commentPanelOpen,
          commentFilter: t.commentFilter,
          pendingResolveCommentIds: t.pendingResolveCommentIds,
        })),
        activeTabId: s.activeTabId,
        theme: s.theme,
        peerName: s.peerName,
        myPeerComments: s.myPeerComments,
        submittedPeerCommentIds: s.submittedPeerCommentIds,
        agentRuns: s.agentRuns,
        activeAgentRunIdByTabId: s.activeAgentRunIdByTabId,
      }),
      merge: (persisted, current) => {
        if (typeof persisted !== "object" || persisted === null) {
          return current;
        }
        const p: Partial<AppState> = persisted;
        // Tabs need special handling: fill in defaults for non-persisted fields
        const tabs = Array.isArray(p.tabs)
          ? p.tabs.map((t) => {
              const workspaceId = t.workspaceId ?? crypto.randomUUID();
              return createDefaultTab({
                ...t,
                workspaceId,
                label: t.label ?? "document",
                fileTree: getPersistedTabFileTree(t),
                rawContent:
                  loadWorkspaceContent(workspaceId) ?? t.rawContent ?? "",
              });
            })
          : current.tabs;
        const relayDefaults = createRelayState();
        const peerReviewDefaults = createPeerReviewState();
        const agentWorkflowState = hydrateAgentWorkflowState(p);
        return {
          ...current,
          ...p,
          tabs,
          ...agentWorkflowState,
          ...peerReviewDefaults,
          submittedPeerCommentIds: Array.isArray(p.submittedPeerCommentIds)
            ? p.submittedPeerCommentIds
            : peerReviewDefaults.submittedPeerCommentIds,
          myPeerComments: Array.isArray(p.myPeerComments)
            ? p.myPeerComments
            : peerReviewDefaults.myPeerComments,
          peerName: p.peerName ?? peerReviewDefaults.peerName,
          // Transient relay state must always reset on load
          ...relayDefaults,
        };
      },
    },
  ),
);

// Keep browser tab title in sync with the active file
const APP_TITLE = "critiq.ink";
configureRelayApplicationPort({ getState: () => useAppStore.getState() });

useAppStore.subscribe((state) => {
  const name = state.isPeerMode
    ? state.peerActiveFilePath?.split("/").pop()
    : getWorkspaceActiveTab(state)?.fileName;
  const title = name ? `${name} — ${APP_TITLE}` : APP_TITLE;
  if (document.title !== title) {
    document.title = title;
  }
});

const cachedRawContentByWorkspace = new Map<string, string>();
useAppStore.subscribe((state) => {
  for (const tab of state.tabs) {
    if (cachedRawContentByWorkspace.get(tab.workspaceId) === tab.rawContent) {
      continue;
    }
    cachedRawContentByWorkspace.set(tab.workspaceId, tab.rawContent);
    saveWorkspaceContent(tab.workspaceId, tab.rawContent);
  }
});
