import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createAppShellActions,
  createAppShellControllerActions,
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
import { createRelayActions, createRelayState } from "../modules/relay";
import type { RelayActions, RelayState } from "../modules/relay";
import {
  createSharingActions,
  createSharingControllerActions,
  syncActiveShares as syncActiveSharesService,
} from "../modules/sharing";
import type { SharingActions } from "../modules/sharing";
import {
  buildUpdatedActiveTabs,
  buildUpdatedTabs,
  createWorkspaceActions,
  createWorkspaceControllerActions,
  createWorkspaceState,
  getActiveTab as getWorkspaceActiveTab,
  getLiveFileTree,
  loadWorkspaceHistory,
} from "../modules/workspace";
import type {
  WorkspaceActions,
  WorkspaceState,
} from "../modules/workspace";
import { toPersistedTree } from "../types/fileTree";
import type {
  HydratedSidebarTreeNode,
  SidebarTreeNode,
} from "../types/fileTree";
import type { CommentType } from "../types/criticmarkup";
import type { TabState } from "../types/tab";
import { createDefaultTab } from "../types/tab";
import type { ShareRecord } from "../types/share";

const SHARES_KEY = "markreview-shares";

interface AppState
  extends AppShellState,
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
  } | null;
  setHoveredBlockHighlight: (
    highlight: {
      blockIndex: number;
      commentType: CommentType;
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
      const appShellControllerActions = createAppShellControllerActions(set);
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
        syncActiveShares: syncActiveSharesService,
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

      return {
        ...createWorkspaceState(loadWorkspaceHistory()),
        ...createAppShellState(),
        ...createRelayState(),
        ...createPeerReviewState(),

        hoveredBlockHighlight: null,
        setHoveredBlockHighlight: (highlight) =>
          set({ hoveredBlockHighlight: highlight }),

        ...workspaceActions,
        ...workspaceControllerActions,

        // ── Tab-scoped actions ──────────────────────────────────────────────
        ...hostReviewActions,
        ...hostReviewControllerActions,

        // ── Global actions ────────────────────────────────────────────────
        ...appShellActions,
        ...appShellControllerActions,

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
      version: 2,
      migrate: (persisted, version) => {
        if (version === 0 || version === 1) {
          // Old flat format → wrap into single tab
          if (isOldFormat(persisted)) {
            const hasContent = !!(
              persisted.fileName || persisted.directoryName
            );
            const tabId = crypto.randomUUID();
            const tabs = hasContent
              ? [
                  {
                    id: tabId,
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
                    commentFilter: "all" as const,
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
                    restoreError: null,
                  },
                ]
              : [];

            // Migrate old shares to the new tab
            try {
              const oldRaw = localStorage.getItem(SHARES_KEY);
              if (oldRaw && tabs.length > 0) {
                const oldShares: unknown = JSON.parse(oldRaw);
                if (Array.isArray(oldShares)) {
                  const allShares: Record<string, ShareRecord[]> = {
                    [tabId]: oldShares,
                  };
                  localStorage.setItem(SHARES_KEY, JSON.stringify(allShares));
                  tabs[0].shares = oldShares;
                }
              }
            } catch (e) {
              console.error("[migrate] failed to migrate shares:", e);
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
              presentationMode: false,
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
          label: t.label,
          fileName: t.fileName,
          rawContent: t.rawContent,
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
      }),
      merge: (persisted, current) => {
        if (typeof persisted !== "object" || persisted === null) {
          return current;
        }
        const p: Partial<AppState> = persisted;
        // Tabs need special handling: fill in defaults for non-persisted fields
        const tabs = Array.isArray(p.tabs)
          ? p.tabs.map((t) =>
              createDefaultTab({
                ...t,
                label: t.label ?? "document",
                fileTree: getPersistedTabFileTree(t),
              }),
            )
          : current.tabs;
        const relayDefaults = createRelayState();
        const peerReviewDefaults = createPeerReviewState();
        return {
          ...current,
          ...p,
          tabs,
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
useAppStore.subscribe((state) => {
  const name = state.isPeerMode
    ? state.peerActiveFilePath?.split("/").pop()
    : getWorkspaceActiveTab(state)?.fileName;
  const title = name ? `${name} — ${APP_TITLE}` : APP_TITLE;
  if (document.title !== title) {
    document.title = title;
  }
});
