import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  openFile as fsOpenFile,
  openDirectory as fsOpenDirectory,
  readFile,
  writeFile,
  buildFileTree,
} from "../services/fileSystem";
import { saveHandle, getHandle, removeHandle } from "../services/handleStore";
import { parseCriticMarkup } from "../services/criticmarkup";
import { assignBlockIndices } from "../services/blockIndex";
import { insertComment as insertCommentService } from "../services/insertComment";
import { applyEdit } from "../services/editComment";
import { applyDelete } from "../services/deleteComment";
import { ShareStorage } from "../services/shareStorage";
import {
  generateKey,
  keyToBase64url,
  base64urlToKey,
  docIdFromKey,
} from "../services/crypto";
import { buildShareUrlFromOrigin, parseShareHash } from "../utils/shareUrl";
import { findFileInTree } from "../types/fileTree";
import type { FileTreeNode, FileNode } from "../types/fileTree";
import type { Comment, CommentType } from "../types/criticmarkup";
import type { ShareRecord, SharePayload, PeerComment } from "../types/share";
import type { TabState, FileCommentEntry } from "../types/tab";
import { createDefaultTab } from "../types/tab";
import { getActiveTab, getUnsubmittedPeerComments } from "./selectors";
import { WORKER_URL } from "../config";

const SHARES_KEY = "markreview-shares";

function stableShareKey(tab: {
  directoryName: string | null;
  fileName: string | null;
  id: string;
}): string {
  return tab.directoryName ?? tab.fileName ?? tab.id;
}

function isShareRecordMap(v: unknown): v is Record<string, ShareRecord[]> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    return false;
  }
  return Object.values(v).every((val) => Array.isArray(val));
}

function loadAllShares(): Record<string, ShareRecord[]> {
  try {
    const raw = localStorage.getItem(SHARES_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (isShareRecordMap(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

function saveAllShares(all: Record<string, ShareRecord[]>) {
  localStorage.setItem(SHARES_KEY, JSON.stringify(all));
}

function saveShares(key: string, shares: ShareRecord[]) {
  const all = loadAllShares();
  all[key] = shares;
  saveAllShares(all);
}

/** Load shares, migrate old tabId keys to stable keys, prune expired entries. */
function loadAndCleanShares(tabs: TabState[]): Record<string, ShareRecord[]> {
  const all = loadAllShares();
  let changed = false;

  // Migrate old tabId-keyed entries to stable keys
  for (const tab of tabs) {
    const stableKey = stableShareKey(tab);
    if (tab.id === stableKey) {
      continue;
    }
    const oldShares = all[tab.id];
    if (!oldShares || oldShares.length === 0) {
      continue;
    }
    const existing = all[stableKey] ?? [];
    const existingDocIds = new Set(existing.map((s) => s.docId));
    const merged = [
      ...existing,
      ...oldShares.filter((s) => !existingDocIds.has(s.docId)),
    ];
    all[stableKey] = merged;
    delete all[tab.id];
    changed = true;
  }

  // Prune expired shares
  const now = new Date();
  for (const key of Object.keys(all)) {
    const live = all[key].filter((s) => new Date(s.expiresAt) > now);
    if (live.length !== all[key].length) {
      changed = true;
    }
    if (live.length === 0) {
      delete all[key];
    } else {
      all[key] = live;
    }
  }

  if (changed) {
    saveAllShares(all);
  }
  return all;
}

/** Collect file contents from a tree into a flat record. */
async function collectTreeContents(
  nodes: FileTreeNode[],
  activeFilePath: string | null,
  rawContent: string,
  allowedPaths?: Set<string> | null,
): Promise<Record<string, string>> {
  const tree: Record<string, string> = {};
  const walk = async (items: FileTreeNode[]) => {
    for (const node of items) {
      if (node.kind === "file") {
        const path = node.path;
        if (allowedPaths && !allowedPaths.has(path)) {
          continue;
        }
        if (path === activeFilePath && rawContent) {
          tree[path] = rawContent;
        } else {
          try {
            tree[path] = await readFile(node.handle);
          } catch (e) {
            console.warn(
              "[collectTreeContents] skipping unreadable file:",
              path,
              e,
            );
          }
        }
      } else {
        await walk(node.children);
      }
    }
  };
  await walk(nodes);
  return tree;
}

/** Restore CryptoKeys from share records (skipping expired ones). */
async function restoreShareKeys(
  shares: ShareRecord[],
): Promise<Record<string, CryptoKey>> {
  const keys: Record<string, CryptoKey> = {};
  const now = new Date();
  for (const share of shares) {
    if (new Date(share.expiresAt) <= now) {
      continue;
    }
    try {
      keys[share.docId] = await base64urlToKey(share.keyB64);
    } catch {
      // skip shares with invalid keys
    }
  }
  return keys;
}

interface AppState {
  // Tab management
  tabs: TabState[];
  activeTabId: string | null;

  // Global UI
  theme: "light" | "dark";
  focusMode: boolean;
  presentationMode: boolean;
  toast: string | null;

  // Peer mode (full-screen takeover, not in tabs)
  isPeerMode: boolean;
  peerName: string | null;
  sharedContent: SharePayload | null;
  myPeerComments: PeerComment[];
  submittedPeerCommentIds: string[];
  peerShareKeys: Record<string, CryptoKey>;
  peerActiveDocId: string | null;
  // Peer uses rawContent/fileName/activeFilePath for display — these are
  // stored at top level since peer mode is not tab-based
  peerRawContent: string;
  peerFileName: string | null;
  peerActiveFilePath: string | null;
  peerResolvedComments: Comment[];
  peerComments: Comment[];
  peerCommentPanelOpen: boolean;

  // Tab management actions
  addTab: (tab: TabState) => void;
  removeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  openFileInNewTab: () => Promise<void>;
  openDirectoryInNewTab: () => Promise<void>;

  // Tab-scoped actions (operate on active tab)
  selectFile: (node: FileNode) => Promise<void>;
  clearFile: () => void;
  setComments: (comments: Comment[]) => void;
  setActiveCommentId: (id: string | null) => void;
  toggleCommentPanel: () => void;
  setCommentFilter: (f: CommentType | "all" | "pending" | "resolved") => void;
  toggleSidebar: () => void;
  refreshFile: () => Promise<void>;
  refreshFileTree: () => Promise<void>;
  addComment: (
    blockIndex: number,
    type: CommentType,
    text: string,
  ) => Promise<void>;
  editComment: (id: string, type: CommentType, text: string) => Promise<void>;
  deleteComment: (id: string) => Promise<void>;
  undo: () => Promise<void>;
  clearUndo: () => void;
  scanAllFileComments: () => Promise<void>;
  navigateToComment: (filePath: string, rawStart: number) => void;
  navigateToBlock: (filePath: string, blockIndex: number) => void;
  clearPendingScrollTarget: () => void;
  restoreShareSessions: () => Promise<void>;

  // Global actions
  setTheme: (theme: "light" | "dark") => void;
  toggleFocusMode: () => void;
  enterPresentationMode: () => void;
  exitPresentationMode: () => void;
  showToast: (msg: string) => void;
  dismissToast: () => void;
  restoreTabs: () => Promise<void>;

  // Sharing actions (tab-scoped)
  shareContent: (opts: {
    ttl: number;
    nodes?: FileTreeNode[];
    label?: string;
  }) => Promise<string>;
  revokeShare: (docId: string) => Promise<void>;
  updateShare: (docId: string) => Promise<void>;
  fetchPendingComments: (docId: string) => Promise<void>;
  mergeComment: (docId: string, comment: PeerComment) => Promise<void>;
  dismissComment: (docId: string, cmtId: string) => void;
  clearPendingComments: (docId: string) => Promise<void>;
  toggleSharedPanel: () => void;
  syncActiveShares: () => Promise<void>;

  // Peer actions
  setPeerName: (name: string) => void;
  loadSharedContent: () => Promise<void>;
  selectPeerFile: (path: string) => void;
  postPeerComment: (
    blockIndex: number,
    type: CommentType,
    text: string,
    path: string,
  ) => void;
  deletePeerComment: (commentId: string) => void;
  editPeerComment: (commentId: string, type: CommentType, text: string) => void;
  syncPeerComments: () => Promise<void>;
}

function getStorage(): ShareStorage | null {
  return WORKER_URL ? new ShareStorage(WORKER_URL) : null;
}

function scrollToBlock(blockIndex: number | undefined) {
  if (blockIndex === undefined) {
    return;
  }
  document
    .querySelector(`[data-block-index="${blockIndex}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function isPermissionError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.name === "NotAllowedError" || e.name === "SecurityError")
  );
}

// Helper: update the active tab within the tabs array
function updateActiveTab(
  get: () => AppState,
  set: (
    partial: Partial<AppState> | ((s: AppState) => Partial<AppState>),
  ) => void,
  updater: (tab: TabState) => Partial<TabState>,
) {
  const { activeTabId, tabs } = get();
  if (!activeTabId) {
    return;
  }
  set({
    tabs: tabs.map((t) => (t.id === activeTabId ? { ...t, ...updater(t) } : t)),
  });
}

// Helper: update a specific tab by id
function updateTab(
  get: () => AppState,
  set: (
    partial: Partial<AppState> | ((s: AppState) => Partial<AppState>),
  ) => void,
  tabId: string,
  updater: (tab: TabState) => Partial<TabState>,
) {
  set({
    tabs: get().tabs.map((t) => (t.id === tabId ? { ...t, ...updater(t) } : t)),
  });
}

// Helper: get the active tab state
function activeTab(get: () => AppState): TabState | null {
  return getActiveTab(get());
}

// Helper: write file, update tab state with undo, handle permission errors
async function writeAndUpdate(
  get: () => AppState,
  set: (
    partial: Partial<AppState> | ((s: AppState) => Partial<AppState>),
  ) => void,
  fileHandle: FileSystemFileHandle,
  newRaw: string,
) {
  try {
    await writeFile(fileHandle, newRaw);
    updateActiveTab(get, set, (t) => ({
      rawContent: newRaw,
      writeAllowed: true,
      undoState: { rawContent: t.rawContent },
    }));
  } catch (e) {
    if (isPermissionError(e)) {
      updateActiveTab(get, set, () => ({ writeAllowed: false }));
    } else {
      console.error("[writeAndUpdate] write failed:", e);
    }
  }
}

// Persistence migration: detect old flat format and convert
interface OldPersistedState {
  fileName?: string | null;
  rawContent?: string;
  theme?: "light" | "dark";
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

      // ── Tab management ──────────────────────────────────────────────────

      addTab: (tab) => {
        set({
          tabs: [...get().tabs, tab],
          activeTabId: tab.id,
        });
      },

      removeTab: (tabId) => {
        const { tabs, activeTabId } = get();
        const idx = tabs.findIndex((t) => t.id === tabId);
        if (idx === -1) {
          return;
        }
        const updated = tabs.filter((t) => t.id !== tabId);
        let newActiveId: string | null = null;
        if (updated.length > 0) {
          if (activeTabId === tabId) {
            // Switch to adjacent tab
            const newIdx = Math.min(idx, updated.length - 1);
            newActiveId = updated[newIdx].id;
          } else {
            newActiveId = activeTabId;
          }
        }
        // Clean up IndexedDB handles for the removed tab
        removeHandle(`tab:${tabId}:directory`).catch((e) =>
          console.warn("[handleStore] cleanup failed:", e),
        );
        removeHandle(`tab:${tabId}:file`).catch((e) =>
          console.warn("[handleStore] cleanup failed:", e),
        );
        set({ tabs: updated, activeTabId: newActiveId });
      },

      switchTab: (tabId) => {
        set({ activeTabId: tabId });
      },

      openFileInNewTab: async () => {
        const result = await fsOpenFile();
        if (!result) {
          return;
        }
        const raw = await readFile(result.handle);
        const tab = createDefaultTab({
          label: result.name,
          fileHandle: result.handle,
          fileName: result.name,
          rawContent: raw,
        });
        get().addTab(tab);
        await saveHandle(`tab:${tab.id}:file`, result.handle);
      },

      openDirectoryInNewTab: async () => {
        const result = await fsOpenDirectory();
        if (!result) {
          return;
        }
        const tab = createDefaultTab({
          label: result.name,
          directoryHandle: result.handle,
          directoryName: result.name,
          sidebarOpen: true,
        });
        get().addTab(tab);
        await saveHandle(`tab:${tab.id}:directory`, result.handle);
        const tree = await buildFileTree(result.handle);
        updateTab(get, set, tab.id, () => ({ fileTree: tree }));
        // Scan comments after tree is built — need to ensure the tab is active
        const currentActive = get().activeTabId;
        if (currentActive === tab.id) {
          get().scanAllFileComments();
        }
      },

      // ── Tab-scoped actions ──────────────────────────────────────────────

      selectFile: async (node: FileNode) => {
        const raw = await readFile(node.handle);
        updateActiveTab(get, set, () => ({
          fileHandle: node.handle,
          fileName: node.name,
          rawContent: raw,
          activeFilePath: node.path,
          resolvedComments: [],
        }));
      },

      clearFile: () =>
        updateActiveTab(get, set, () => ({
          fileHandle: null,
          fileName: null,
          rawContent: "",
          directoryHandle: null,
          directoryName: null,
          fileTree: [],
          activeFilePath: null,
        })),

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
        updateActiveTab(get, set, () => ({
          comments,
          activeCommentId: null,
          commentFilter: "all" as const,
          allFileComments: updated,
        }));
      },

      setActiveCommentId: (id) =>
        updateActiveTab(get, set, () => ({ activeCommentId: id })),

      toggleCommentPanel: () => {
        if (get().isPeerMode) {
          set((s) => ({ peerCommentPanelOpen: !s.peerCommentPanelOpen }));
        } else {
          updateActiveTab(get, set, (t) => ({
            commentPanelOpen: !t.commentPanelOpen,
            sharedPanelOpen: !t.commentPanelOpen ? false : t.sharedPanelOpen,
          }));
        }
      },

      setCommentFilter: (f) =>
        updateActiveTab(get, set, () => ({
          commentFilter: f,
          activeCommentId: null,
        })),

      toggleSidebar: () =>
        updateActiveTab(get, set, (t) => ({ sidebarOpen: !t.sidebarOpen })),

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
        await scanNodes(tab.fileTree);
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
        updateTab(get, set, tabId, () => ({ allFileComments: merged }));
      },

      navigateToComment: (filePath, rawStart) => {
        const tab = activeTab(get);
        if (!tab) {
          return;
        }
        if (filePath === tab.activeFilePath) {
          const comment = tab.comments.find((c) => c.rawStart === rawStart);
          if (comment) {
            updateActiveTab(get, set, () => ({
              activeCommentId: comment.id,
            }));
            scrollToBlock(comment.blockIndex);
          }
          return;
        }
        const fileNode = findFileInTree(tab.fileTree, filePath);
        if (fileNode) {
          updateActiveTab(get, set, () => ({
            pendingScrollTarget: { filePath, rawStart },
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
        const fileNode = findFileInTree(tab.fileTree, filePath);
        if (fileNode) {
          updateActiveTab(get, set, () => ({
            pendingScrollTarget: { filePath, blockIndex },
          }));
          get().selectFile(fileNode);
        }
      },

      clearPendingScrollTarget: () =>
        updateActiveTab(get, set, () => ({ pendingScrollTarget: null })),

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
          updateActiveTab(get, set, (t) => ({
            rawContent: t.undoState!.rawContent,
            undoState: null,
            writeAllowed: true,
          }));
        } catch (e) {
          if (isPermissionError(e)) {
            updateActiveTab(get, set, () => ({ writeAllowed: false }));
          } else {
            console.error("[undo] write failed:", e);
          }
        }
      },

      clearUndo: () => updateActiveTab(get, set, () => ({ undoState: null })),

      refreshFile: async () => {
        const tab = activeTab(get);
        if (!tab?.fileHandle) {
          return;
        }
        try {
          const newRaw = await readFile(tab.fileHandle);
          const changed = newRaw !== tab.rawContent;
          const newlyResolved = tab.comments.filter(
            (c) => !newRaw.includes(c.raw),
          );
          updateActiveTab(get, set, () => ({
            rawContent: newRaw,
            resolvedComments: newlyResolved,
          }));
          if (changed) {
            get().syncActiveShares();
          }
        } catch (e) {
          console.error("[refreshFile] file read failed:", e);
        }
      },

      refreshFileTree: async () => {
        const tab = activeTab(get);
        if (!tab?.directoryHandle) {
          return;
        }
        const tabId = tab.id;
        try {
          const tree = await buildFileTree(tab.directoryHandle);
          updateTab(get, set, tabId, () => ({ fileTree: tree }));
          get().scanAllFileComments();
        } catch (e) {
          console.error("[refreshFileTree] directory read failed:", e);
        }
      },

      restoreTabs: async () => {
        const { tabs } = get();
        for (const tab of tabs) {
          if (tab.directoryName) {
            try {
              const handle = await getHandle<FileSystemDirectoryHandle>(
                `tab:${tab.id}:directory`,
              );
              if (!handle) {
                continue;
              }
              const perm = await handle.queryPermission({ mode: "read" });
              if (perm !== "granted") {
                continue;
              }
              const tree = await buildFileTree(handle);
              // Re-select the previously active file to restore its fileHandle
              let restoredFileHandle: FileSystemFileHandle | null = null;
              let restoredRaw: string | null = null;
              if (tab.activeFilePath) {
                const fileNode = findFileInTree(tree, tab.activeFilePath);
                if (fileNode) {
                  restoredFileHandle = fileNode.handle;
                  try {
                    restoredRaw = await readFile(fileNode.handle);
                  } catch (e) {
                    console.warn(
                      "[restoreTabs] file read failed, keeping persisted content:",
                      e,
                    );
                  }
                }
              }
              updateTab(get, set, tab.id, () => ({
                directoryHandle: handle,
                directoryName: handle.name,
                fileTree: tree,
                ...(restoredFileHandle
                  ? { fileHandle: restoredFileHandle }
                  : {}),
                ...(restoredRaw !== null ? { rawContent: restoredRaw } : {}),
              }));
            } catch (e) {
              console.error(
                "[restoreTabs] failed to restore directory tab:",
                tab.id,
                e,
              );
            }
          } else if (tab.fileName) {
            try {
              const handle = await getHandle<FileSystemFileHandle>(
                `tab:${tab.id}:file`,
              );
              if (!handle) {
                continue;
              }
              const perm = await handle.queryPermission({ mode: "readwrite" });
              if (perm !== "granted") {
                continue;
              }
              let restoredRaw: string | null = null;
              try {
                restoredRaw = await readFile(handle);
              } catch (e) {
                console.warn(
                  "[restoreTabs] file read failed, keeping persisted content:",
                  e,
                );
              }
              updateTab(get, set, tab.id, () => ({
                fileHandle: handle,
                ...(restoredRaw !== null ? { rawContent: restoredRaw } : {}),
              }));
            } catch (e) {
              console.error(
                "[restoreTabs] failed to restore file tab:",
                tab.id,
                e,
              );
            }
          }
        }
        // Migrate old tabId-keyed shares, prune expired, then restore
        const allShares = loadAndCleanShares(get().tabs);
        for (const tab of get().tabs) {
          const tabShares = allShares[stableShareKey(tab)] ?? [];
          if (tabShares.length === 0) {
            continue;
          }
          const restoredKeys = await restoreShareKeys(tabShares);
          updateTab(get, set, tab.id, (t) => ({
            shares: tabShares,
            shareKeys: { ...t.shareKeys, ...restoredKeys },
          }));
        }
      },

      restoreShareSessions: async () => {
        const tab = activeTab(get);
        if (!tab) {
          return;
        }
        const restoredKeys = await restoreShareKeys(tab.shares);
        if (Object.keys(restoredKeys).length > 0) {
          updateActiveTab(get, set, (t) => ({
            shareKeys: { ...t.shareKeys, ...restoredKeys },
          }));
        }
      },

      // ── Global actions ────────────────────────────────────────────────

      setTheme: (theme) => set({ theme }),
      toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
      enterPresentationMode: () => {
        document.documentElement.requestFullscreen?.().catch(() => {});
        set({ presentationMode: true });
      },
      exitPresentationMode: () => set({ presentationMode: false }),
      showToast: (msg) => set({ toast: msg }),
      dismissToast: () => set({ toast: null }),

      // ── Sharing actions (tab-scoped) ──────────────────────────────────

      shareContent: async ({ ttl, nodes, label: scopeLabel }) => {
        const storage = getStorage();
        if (!storage) {
          throw new Error("Worker URL not configured");
        }
        const tab = activeTab(get);
        if (!tab) {
          throw new Error("No active tab");
        }
        const tabId = tab.id;
        const label =
          scopeLabel ?? tab.directoryName ?? tab.fileName ?? "document";

        const sourceNodes =
          nodes ??
          (tab.directoryName && tab.fileTree.length > 0 ? tab.fileTree : null);
        const tree = sourceNodes
          ? await collectTreeContents(
              sourceNodes,
              tab.activeFilePath,
              tab.rawContent,
            )
          : {};
        if (Object.keys(tree).length === 0 && tab.rawContent) {
          const path = tab.activeFilePath ?? tab.fileName ?? "document.md";
          tree[path] = tab.rawContent;
        }

        const key = await generateKey();
        const docId = await docIdFromKey(key);
        const { hostSecret } = await storage.uploadContent(docId, tree, key, {
          ttl,
          label,
        });
        const keyB64 = await keyToBase64url(key);

        const now = new Date();
        const record: ShareRecord = {
          docId,
          hostSecret,
          label,
          createdAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
          pendingCommentCount: 0,
          keyB64,
          fileCount: Object.keys(tree).length,
          sharedPaths: Object.keys(tree),
        };
        const currentTab = get().tabs.find((t) => t.id === tabId);
        if (!currentTab) {
          throw new Error("Tab disappeared");
        }
        const shares = [...currentTab.shares, record];
        saveShares(stableShareKey(currentTab), shares);
        updateTab(get, set, tabId, (t) => ({
          shares,
          shareKeys: { ...t.shareKeys, [docId]: key },
          activeDocId: docId,
        }));

        return buildShareUrlFromOrigin({ keyB64, name: label });
      },

      revokeShare: async (docId) => {
        const storage = getStorage();
        const tab = activeTab(get);
        if (!tab) {
          return;
        }
        const tabId = tab.id;
        const record = tab.shares.find((s) => s.docId === docId);
        if (!record) {
          return;
        }

        try {
          await storage?.deleteContent(docId, record.hostSecret);
        } catch (e) {
          console.error("[revokeShare] failed to delete content:", docId, e);
        }
        try {
          await storage?.deleteComments(docId, record.hostSecret);
        } catch (e) {
          console.error("[revokeShare] failed to delete comments:", docId, e);
        }
        const updated = tab.shares.filter((s) => s.docId !== docId);
        saveShares(stableShareKey(tab), updated);
        updateTab(get, set, tabId, (t) => {
          const pc = { ...t.pendingComments };
          delete pc[docId];
          const sk = { ...t.shareKeys };
          delete sk[docId];
          return {
            shares: updated,
            pendingComments: pc,
            shareKeys: sk,
            activeDocId: t.activeDocId === docId ? null : t.activeDocId,
          };
        });
      },

      updateShare: async (docId) => {
        const storage = getStorage();
        if (!storage) {
          throw new Error("Worker URL not configured");
        }
        const tab = activeTab(get);
        if (!tab) {
          throw new Error("No active tab");
        }
        const record = tab.shares.find((s) => s.docId === docId);
        if (!record) {
          throw new Error("Share not found");
        }
        const key = tab.shareKeys[docId];
        if (!key)
          throw new Error(
            "Encryption key not available (session may have expired)",
          );

        const allowed = record.sharedPaths ? new Set(record.sharedPaths) : null;
        const tree =
          tab.fileTree.length > 0
            ? await collectTreeContents(
                tab.fileTree,
                tab.activeFilePath,
                tab.rawContent,
                allowed,
              )
            : {};
        if (Object.keys(tree).length === 0 && tab.rawContent) {
          const fallbackPath =
            tab.activeFilePath ?? tab.fileName ?? "document.md";
          if (!allowed || allowed.has(fallbackPath)) {
            tree[fallbackPath] = tab.rawContent;
          }
        }

        await storage.updateContent(docId, record.hostSecret, tree, key);
      },

      fetchPendingComments: async (docId) => {
        const storage = getStorage();
        if (!storage) {
          return;
        }
        const tab = activeTab(get);
        if (!tab) {
          return;
        }
        const tabId = tab.id;
        let key = tab.shareKeys[docId];
        // Fallback: restore key from the share record if not yet in memory
        if (!key) {
          const share = tab.shares.find((s) => s.docId === docId);
          if (!share?.keyB64) {
            return;
          }
          key = await base64urlToKey(share.keyB64);
          updateTab(get, set, tabId, (t) => ({
            shareKeys: { ...t.shareKeys, [docId]: key },
          }));
        }
        const comments = await storage.fetchComments(docId, key);
        const currentTab = get().tabs.find((t) => t.id === tabId);
        if (!currentTab) {
          return;
        }
        const pc = { ...currentTab.pendingComments, [docId]: comments };
        const shares = currentTab.shares.map((s) =>
          s.docId === docId
            ? { ...s, pendingCommentCount: comments.length }
            : s,
        );
        saveShares(stableShareKey(currentTab), shares);
        updateTab(get, set, tabId, () => ({
          pendingComments: pc,
          shares,
        }));
      },

      mergeComment: async (docId, comment) => {
        const tab = activeTab(get);
        if (!tab?.fileHandle) {
          return;
        }
        const currentPath = tab.activeFilePath ?? tab.fileName ?? "";
        if (comment.path !== currentPath) {
          return;
        }

        const { cleanMarkdown } = parseCriticMarkup(tab.rawContent);
        const attribution = ` — ${comment.peerName}`;
        const newRaw = insertCommentService(
          tab.rawContent,
          tab.comments,
          cleanMarkdown,
          comment.blockRef.blockIndex,
          comment.commentType,
          comment.text + attribution,
        );
        await writeAndUpdate(get, set, tab.fileHandle, newRaw);
        get().dismissComment(docId, comment.id);
      },

      dismissComment: (docId, cmtId) => {
        const tab = activeTab(get);
        if (!tab) {
          return;
        }
        const tabId = tab.id;
        const pc = { ...tab.pendingComments };
        pc[docId] = (pc[docId] ?? []).filter((c) => c.id !== cmtId);
        const shares = tab.shares.map((s) =>
          s.docId === docId
            ? { ...s, pendingCommentCount: pc[docId].length }
            : s,
        );
        saveShares(stableShareKey(tab), shares);
        updateTab(get, set, tabId, () => ({
          pendingComments: pc,
          shares,
        }));

        // When all comments for this docId are gone locally, clear from server
        if (pc[docId].length === 0) {
          const record = tab.shares.find((s) => s.docId === docId);
          const storage = getStorage();
          if (record && storage) {
            storage.deleteComments(docId, record.hostSecret).catch(() => {});
          }
        }
      },

      clearPendingComments: async (docId) => {
        const storage = getStorage();
        const tab = activeTab(get);
        if (!tab) {
          return;
        }
        const tabId = tab.id;
        const record = tab.shares.find((s) => s.docId === docId);
        if (record && storage) {
          try {
            await storage.deleteComments(docId, record.hostSecret);
          } catch (e) {
            console.error(
              "[clearPendingComments] failed to delete comments:",
              docId,
              e,
            );
          }
        }
        const pc = { ...tab.pendingComments };
        delete pc[docId];
        const shares = tab.shares.map((s) =>
          s.docId === docId ? { ...s, pendingCommentCount: 0 } : s,
        );
        saveShares(stableShareKey(tab), shares);
        updateTab(get, set, tabId, () => ({
          pendingComments: pc,
          shares,
        }));
      },

      toggleSharedPanel: () =>
        updateActiveTab(get, set, (t) => ({
          sharedPanelOpen: !t.sharedPanelOpen,
          commentPanelOpen: !t.sharedPanelOpen ? false : t.commentPanelOpen,
        })),

      syncActiveShares: async () => {
        const tab = activeTab(get);
        if (!tab) {
          return;
        }
        if (get().isPeerMode) {
          return;
        }
        const now = new Date();
        const active = tab.shares.filter((s) => new Date(s.expiresAt) > now);
        for (const share of active) {
          try {
            await get().updateShare(share.docId);
          } catch (e) {
            console.warn("[sync] failed to push update for", share.docId, e);
          }
        }
      },

      // ── Peer actions ──────────────────────────────────────────────────

      setPeerName: (name) => set({ peerName: name }),

      selectPeerFile: (path) => {
        const { sharedContent } = get();
        if (!sharedContent) {
          return;
        }
        const content = sharedContent.tree[path];
        if (content === undefined) {
          return;
        }
        set({
          peerRawContent: content,
          peerFileName: path,
          peerActiveFilePath: path,
          peerResolvedComments: [],
        });
      },

      loadSharedContent: async () => {
        const parsed = parseShareHash();
        if (!parsed) {
          return;
        }
        const { keyB64 } = parsed;
        const storage = getStorage();
        if (!storage) {
          return;
        }
        try {
          const key = await base64urlToKey(keyB64);
          const docId = await docIdFromKey(key);
          const payload = await storage.fetchContent(docId, key);
          const currentPath = get().peerActiveFilePath;
          const paths = Object.keys(payload.tree);
          const activePath =
            currentPath && currentPath in payload.tree
              ? currentPath
              : (paths[0] ?? null);
          set({
            isPeerMode: true,
            sharedContent: payload,
            peerShareKeys: { ...get().peerShareKeys, [docId]: key },
            peerRawContent: activePath ? payload.tree[activePath] : "",
            peerFileName: activePath,
            peerActiveFilePath: activePath,
            peerActiveDocId: docId,
          });
        } catch (e) {
          set({ isPeerMode: true, sharedContent: null });
          console.error("[share] Failed to load shared content:", e);
        }
      },

      postPeerComment: (blockIndex, type, text, path) => {
        const { peerName } = get();
        const comment: PeerComment = {
          id: `c_${crypto.randomUUID()}`,
          peerName: peerName ?? "Anonymous",
          path,
          blockRef: { blockIndex, contentPreview: "" },
          commentType: type,
          text,
          createdAt: new Date().toISOString(),
        };

        set({ myPeerComments: [comment, ...get().myPeerComments] });
      },

      deletePeerComment: (commentId) => {
        const { myPeerComments, submittedPeerCommentIds } = get();
        set({
          myPeerComments: myPeerComments.filter((c) => c.id !== commentId),
          submittedPeerCommentIds: submittedPeerCommentIds.filter(
            (id) => id !== commentId,
          ),
        });
      },

      editPeerComment: (commentId, type, text) => {
        const { myPeerComments } = get();
        const updated = myPeerComments.map((c) =>
          c.id === commentId ? { ...c, commentType: type, text } : c,
        );
        set({ myPeerComments: updated });
      },

      syncPeerComments: async () => {
        const parsed = parseShareHash();
        if (!parsed) {
          return;
        }
        const { keyB64 } = parsed;
        const storage = getStorage();
        if (!storage) {
          return;
        }
        const key = await base64urlToKey(keyB64);
        const docId = await docIdFromKey(key);
        const unsubmitted = getUnsubmittedPeerComments(get());
        if (unsubmitted.length === 0) {
          return;
        }
        for (const comment of unsubmitted) {
          await storage.postComment(docId, comment, key);
        }
        set({
          submittedPeerCommentIds: [
            ...get().submittedPeerCommentIds,
            ...unsubmitted.map((c) => c.id),
          ],
        });
      },
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

            return {
              tabs,
              activeTabId: tabs[0]?.id ?? null,
              theme: persisted.theme ?? "light",
              peerName: persisted.peerName ?? null,
              // Defaults for other global fields
              focusMode: false,
              presentationMode: false,
              toast: null,
              isPeerMode: false,
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
          sidebarOpen: t.sidebarOpen,
          commentPanelOpen: t.commentPanelOpen,
          commentFilter: t.commentFilter,
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
              createDefaultTab({ ...t, label: t.label ?? "document" }),
            )
          : current.tabs;
        return {
          ...current,
          ...p,
          tabs,
          submittedPeerCommentIds: Array.isArray(p.submittedPeerCommentIds)
            ? p.submittedPeerCommentIds
            : [],
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
    : getActiveTab(state)?.fileName;
  const title = name ? `${name} — ${APP_TITLE}` : APP_TITLE;
  if (document.title !== title) {
    document.title = title;
  }
});
