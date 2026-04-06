// TODO: Split the remaining host-review logic out of this file.
// Pre-existing issue — not addressed in this PR to keep the diff focused.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  readFile,
  writeFile,
} from "../services/fileSystem";
import { parseCriticMarkup } from "../services/criticmarkup";
import { assignBlockIndices } from "../services/blockIndex";
import { insertComment as insertCommentService } from "../services/insertComment";
import { applyEdit } from "../services/editComment";
import { applyDelete } from "../services/deleteComment";
import { syncActiveShares as syncActiveSharesService } from "../services/shareSync";
import {
  findLiveFileInTree,
  toPersistedTree,
} from "../types/fileTree";
import type {
  FileTreeNode,
  HydratedSidebarTreeNode,
  SidebarTreeNode,
} from "../types/fileTree";
import type { Comment, CommentType } from "../types/criticmarkup";
import type { TabState, FileCommentEntry } from "../types/tab";
import { createRelayActions, createRelayState } from "../modules/relay/state";
import type { RelayActions, RelayState } from "../modules/relay/types";
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
  createPeerReviewActions,
  createPeerReviewState,
} from "../modules/peer-review";
import type {
  PeerReviewActions,
  PeerReviewState,
} from "../modules/peer-review";
import { createSharingActions } from "../modules/sharing/state";
import type { SharingActions } from "../modules/sharing/types";
import {
  buildUpdatedActiveTabs,
  buildUpdatedTabs,
  getActiveTab as getWorkspaceActiveTab,
  getLiveFileTree,
} from "../modules/workspace/helpers";
import { loadWorkspaceHistory } from "../modules/workspace/controller";
import {
  createWorkspaceActions,
  createWorkspaceState,
} from "../modules/workspace/state";
import type {
  WorkspaceActions,
  WorkspaceState,
} from "../modules/workspace/types";

interface AppState
  extends AppShellState,
    AppShellActions,
    WorkspaceState,
    WorkspaceActions,
    RelayState,
    RelayActions,
    PeerReviewState,
    PeerReviewActions,
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

  // Tab-scoped actions (operate on active tab)
  setComments: (comments: Comment[]) => void;
  setActiveCommentId: (id: string | null) => void;
  toggleCommentPanel: () => void;
  setCommentFilter: (f: CommentType | "all" | "pending" | "resolved") => void;
  addComment: (
    blockIndex: number,
    type: CommentType,
    text: string,
  ) => Promise<void>;
  editComment: (id: string, type: CommentType, text: string) => Promise<void>;
  deleteComment: (id: string) => Promise<void>;
  deleteAllComments: () => Promise<void>;
  undo: () => Promise<void>;
  clearUndo: () => void;
  scanAllFileComments: () => Promise<void>;
  navigateToComment: (filePath: string, rawStart: number) => void;
  navigateToBlock: (filePath: string, blockIndex: number) => void;
  clearPendingScrollTarget: () => void;
}

function scrollToBlock(blockIndex: number | undefined) {
  if (blockIndex === undefined) {
    return;
  }
  const el = document.querySelector(`[data-block-index="${blockIndex}"]`);
  if (!el) {
    console.error(
      `[scrollToBlock] No element found for data-block-index="${blockIndex}"`,
    );
    return;
  }
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function isPermissionError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.name === "NotAllowedError" || e.name === "SecurityError")
  );
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

// Helper: write file, update tab state with undo, handle permission errors
async function writeAndUpdate(
  get: () => AppState,
  set: (
    partial: Partial<AppState> | ((s: AppState) => Partial<AppState>),
  ) => void,
  fileHandle: FileSystemFileHandle,
  newRaw: string,
): Promise<boolean> {
  try {
    await writeFile(fileHandle, newRaw);
    set((state) => ({
      tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, (tab) => ({
        rawContent: newRaw,
        writeAllowed: true,
        undoState: { rawContent: tab.rawContent },
      })),
    }));
    return true;
  } catch (error) {
    if (isPermissionError(error)) {
      set((state) => ({
        tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
          writeAllowed: false,
        })),
      }));
    } else {
      console.error("[writeAndUpdate] write failed:", error);
    }
    return false;
  }
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
    (set, get) => ({
      ...createWorkspaceState(loadWorkspaceHistory()),
      ...createAppShellState(),
      ...createRelayState(),
      ...createPeerReviewState(),

      hoveredBlockHighlight: null,
      setHoveredBlockHighlight: (highlight) =>
        set({ hoveredBlockHighlight: highlight }),

      ...createWorkspaceActions({
        set,
        get,
        scanAllFileComments: () => get().scanAllFileComments(),
        showToast: (message) => get().showToast(message),
        syncActiveShares: () => syncActiveSharesService(),
      }),

      // ── Tab-scoped actions ──────────────────────────────────────────────

      setComments: (comments) => {
        const tab = activeTab(get);
        if (!tab) {
          return;
        }
        const path = tab.activeFilePath ?? tab.fileName;
        const updated = path
          ? {
              ...tab.allFileComments,
              [path]: {
                filePath: path,
                fileName: path.split("/").pop() ?? path,
                comments: comments.map((c) => ({ ...c, filePath: path })),
              },
            }
          : tab.allFileComments;
        set((state) => ({
          tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
            comments,
            activeCommentId: null,
            commentFilter: "all" as const,
            allFileComments: updated,
          })),
        }));
      },

      setActiveCommentId: (id) =>
        set((state) => ({
          tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
            activeCommentId: id,
          })),
        })),

      toggleCommentPanel: () => {
        if (get().isPeerMode) {
          set((s) => ({ peerCommentPanelOpen: !s.peerCommentPanelOpen }));
        } else {
          set((state) => ({
            tabs: buildUpdatedActiveTabs(
              state.tabs,
              state.activeTabId,
              (tab) => ({
                commentPanelOpen: !tab.commentPanelOpen,
                sharedPanelOpen: !tab.commentPanelOpen
                  ? false
                  : tab.sharedPanelOpen,
              }),
            ),
          }));
        }
      },

      setCommentFilter: (f) =>
        set((state) => ({
          tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
            commentFilter: f,
            activeCommentId: null,
          })),
        })),

      scanAllFileComments: async () => {
        const tab = activeTab(get);
        if (!tab) {
          return;
        }
        const tabId = tab.id;
        const result: Record<string, FileCommentEntry> = {};
        const scanNodes = async (nodes: FileTreeNode[]) => {
          for (const node of nodes) {
            if (node.kind === "file") {
              try {
                const content = await readFile(node.handle);
                const parsed = parseCriticMarkup(content);
                const comments = assignBlockIndices(
                  parsed.comments,
                  parsed.cleanMarkdown,
                );
                result[node.path] = {
                  filePath: node.path,
                  fileName: node.name,
                  comments: comments.map((c) => ({
                    ...c,
                    filePath: node.path,
                  })),
                };
              } catch (e) {
                console.warn(
                  "[scanAllFileComments] skipping unreadable file:",
                  node.path,
                  e,
                );
              }
            } else {
              await scanNodes(node.children);
            }
          }
        };
        await scanNodes(getLiveFileTree(tab));
        // Preserve the active file's entry set by setComments
        const currentTab = get().tabs.find((t) => t.id === tabId);
        if (!currentTab) {
          return;
        }
        const activePath = currentTab.activeFilePath ?? currentTab.fileName;
        const merged = { ...result };
        if (activePath && currentTab.allFileComments[activePath]) {
          merged[activePath] = currentTab.allFileComments[activePath];
        }
        set((state) => ({
          tabs: buildUpdatedTabs(state.tabs, tabId, () => ({
            allFileComments: merged,
          })),
        }));
      },

      navigateToComment: (filePath, rawStart) => {
        const tab = activeTab(get);
        if (!tab) {
          return;
        }
        if (filePath === tab.activeFilePath) {
          const comment = tab.comments.find((c) => c.rawStart === rawStart);
          if (comment) {
            set((state) => ({
              tabs: buildUpdatedActiveTabs(
                state.tabs,
                state.activeTabId,
                () => ({
                  activeCommentId: comment.id,
                }),
              ),
            }));
            scrollToBlock(comment.blockIndex);
          }
          return;
        }
        const fileNode = findLiveFileInTree(tab.fileTree, filePath);
        if (fileNode) {
          set((state) => ({
            tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
              pendingScrollTarget: { filePath, rawStart },
            })),
          }));
          get().selectFile(fileNode);
        }
      },

      navigateToBlock: (filePath, blockIndex) => {
        const tab = activeTab(get);
        if (!tab) {
          return;
        }
        if (filePath === tab.activeFilePath) {
          scrollToBlock(blockIndex);
          return;
        }
        const fileNode = findLiveFileInTree(tab.fileTree, filePath);
        if (fileNode) {
          set((state) => ({
            tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
              pendingScrollTarget: { filePath, blockIndex },
            })),
          }));
          get().selectFile(fileNode);
        }
      },

      clearPendingScrollTarget: () =>
        set((state) => ({
          tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
            pendingScrollTarget: null,
          })),
        })),

      deleteComment: async (id) => {
        const tab = activeTab(get);
        if (!tab?.fileHandle) {
          return;
        }
        const comment = tab.comments.find((c) => c.id === id);
        if (!comment) {
          return;
        }
        await writeAndUpdate(
          get,
          set,
          tab.fileHandle,
          applyDelete(tab.rawContent, comment),
        );
      },

      deleteAllComments: async () => {
        const tab = activeTab(get);
        if (!tab?.fileHandle || tab.comments.length === 0) {
          return;
        }
        // Apply deletions from end to start to preserve offsets
        const sorted = [...tab.comments].sort(
          (a, b) => b.rawStart - a.rawStart,
        );
        let raw = tab.rawContent;
        for (const comment of sorted) {
          raw = applyDelete(raw, comment);
        }
        await writeAndUpdate(get, set, tab.fileHandle, raw);
      },

      editComment: async (id, type, text) => {
        const tab = activeTab(get);
        if (!tab?.fileHandle) {
          return;
        }
        const comment = tab.comments.find((c) => c.id === id);
        if (!comment) {
          return;
        }
        await writeAndUpdate(
          get,
          set,
          tab.fileHandle,
          applyEdit(tab.rawContent, comment, type, text),
        );
      },

      addComment: async (blockIndex, type, text) => {
        const tab = activeTab(get);
        if (!tab?.fileHandle) {
          return;
        }
        const { cleanMarkdown } = parseCriticMarkup(tab.rawContent);
        const newRaw = insertCommentService(
          tab.rawContent,
          tab.comments,
          cleanMarkdown,
          blockIndex,
          type,
          text,
        );
        await writeAndUpdate(get, set, tab.fileHandle, newRaw);
      },

      undo: async () => {
        const tab = activeTab(get);
        if (!tab?.undoState || !tab.fileHandle) {
          return;
        }
        try {
          await writeFile(tab.fileHandle, tab.undoState.rawContent);
          set((state) => ({
            tabs: buildUpdatedActiveTabs(
              state.tabs,
              state.activeTabId,
              (tab) => ({
                rawContent: tab.undoState!.rawContent,
                undoState: null,
                writeAllowed: true,
              }),
            ),
          }));
        } catch (e) {
          if (isPermissionError(e)) {
            set((state) => ({
              tabs: buildUpdatedActiveTabs(
                state.tabs,
                state.activeTabId,
                () => ({
                  writeAllowed: false,
                }),
              ),
            }));
          } else {
            console.error("[undo] write failed:", e);
          }
        }
      },

      clearUndo: () =>
        set((state) => ({
          tabs: buildUpdatedActiveTabs(state.tabs, state.activeTabId, () => ({
            undoState: null,
          })),
        })),

      // ── Global actions ────────────────────────────────────────────────

      ...createAppShellActions(set),

      // ── Sharing actions (tab-scoped) ──────────────────────────────────
      ...createSharingActions({
        set,
        get,
        getActiveTab: activeTab,
        buildUpdatedTabs,
        buildUpdatedActiveTabs,
        getLiveFileTree,
        writeAndUpdate,
      }),

      // ── Peer actions ──────────────────────────────────────────────────

      ...createPeerReviewActions(set, get),

      // ── Realtime comment actions ──────────────────────────────────────────

      ...createRelayActions(set),

    }),
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
