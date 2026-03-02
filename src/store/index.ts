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
import { insertComment as insertCommentService } from "../services/insertComment";
import { applyEdit } from "../services/editComment";
import { applyDelete } from "../services/deleteComment";
import { ShareStorage } from "../services/shareStorage";
import {
  generateKey,
  keyToBase64url,
  base64urlToKey,
} from "../services/crypto";
import { buildShareUrlFromOrigin, parseShareHash } from "../utils/shareUrl";
import type { FileTreeNode, FileNode, DirectoryNode } from "../types/fileTree";
import type { Comment, CommentType } from "../types/criticmarkup";
import type { ShareRecord, SharePayload, PeerComment } from "../types/share";
import type { TabState, FileCommentEntry } from "../types/tab";
import { createDefaultTab } from "../types/tab";
import { getActiveTab } from "./selectors";
import { WORKER_URL } from "../config";

const SHARES_KEY = "markreview-shares";

function loadAllShares(): Record<string, ShareRecord[]> {
  try {
    const raw = localStorage.getItem(SHARES_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    // Migration: old format was a flat ShareRecord[]
    if (Array.isArray(parsed)) return {};
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, ShareRecord[]>;
    }
    return {};
  } catch {
    return {};
  }
}

function saveAllShares(all: Record<string, ShareRecord[]>) {
  localStorage.setItem(SHARES_KEY, JSON.stringify(all));
}

function loadSharesForTab(tabId: string): ShareRecord[] {
  return loadAllShares()[tabId] ?? [];
}

function saveSharesForTab(tabId: string, shares: ShareRecord[]) {
  const all = loadAllShares();
  all[tabId] = shares;
  saveAllShares(all);
}

function removeSharesForTab(tabId: string) {
  const all = loadAllShares();
  delete all[tabId];
  saveAllShares(all);
}

interface AppState {
  // Tab management
  tabs: TabState[];
  activeTabId: string | null;

  // Global UI
  theme: "light" | "dark";
  focusMode: boolean;
  toast: string | null;

  // Peer mode (full-screen takeover, not in tabs)
  isPeerMode: boolean;
  peerName: string | null;
  sharedContent: SharePayload | null;
  myPeerComments: PeerComment[];
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
  ) => Promise<void>;
  deletePeerComment: (commentId: string) => void;
  editPeerComment: (commentId: string, type: CommentType, text: string) => void;
}

function getStorage(): ShareStorage | null {
  return WORKER_URL ? new ShareStorage(WORKER_URL) : null;
}

function scrollToBlock(blockIndex: number | undefined) {
  if (blockIndex === undefined) return;
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
  set: (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void,
  updater: (tab: TabState) => Partial<TabState>,
) {
  const { activeTabId, tabs } = get();
  if (!activeTabId) return;
  set({
    tabs: tabs.map((t) =>
      t.id === activeTabId ? { ...t, ...updater(t) } : t,
    ),
  });
}

// Helper: update a specific tab by id
function updateTab(
  get: () => AppState,
  set: (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void,
  tabId: string,
  updater: (tab: TabState) => Partial<TabState>,
) {
  set({
    tabs: get().tabs.map((t) =>
      t.id === tabId ? { ...t, ...updater(t) } : t,
    ),
  });
}

// Helper: get the active tab state
function activeTab(get: () => AppState): TabState | null {
  return getActiveTab(get());
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
      toast: null,

      isPeerMode: false,
      peerName: null,
      sharedContent: null,
      myPeerComments: [],
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
        if (idx === -1) return;
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
        // Clean up IndexedDB handle and shares for the removed tab
        removeHandle(`tab:${tabId}:directory`).catch(() => {});
        removeSharesForTab(tabId);
        set({ tabs: updated, activeTabId: newActiveId });
      },

      switchTab: (tabId) => {
        set({ activeTabId: tabId });
      },

      openFileInNewTab: async () => {
        const result = await fsOpenFile();
        if (!result) return;
        const raw = await readFile(result.handle);
        const tab = createDefaultTab({
          label: result.name,
          fileHandle: result.handle,
          fileName: result.name,
          rawContent: raw,
        });
        get().addTab(tab);
      },

      openDirectoryInNewTab: async () => {
        const result = await fsOpenDirectory();
        if (!result) return;
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
        if (!tab) return;
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

      toggleCommentPanel: () =>
        updateActiveTab(get, set, (t) => ({
          commentPanelOpen: !t.commentPanelOpen,
          sharedPanelOpen: !t.commentPanelOpen ? false : t.sharedPanelOpen,
        })),

      setCommentFilter: (f) =>
        updateActiveTab(get, set, () => ({
          commentFilter: f,
          activeCommentId: null,
        })),

      toggleSidebar: () =>
        updateActiveTab(get, set, (t) => ({ sidebarOpen: !t.sidebarOpen })),

      scanAllFileComments: async () => {
        const tab = activeTab(get);
        if (!tab) return;
        const tabId = tab.id;
        const result: Record<string, FileCommentEntry> = {};
        const scanNodes = async (nodes: FileTreeNode[]) => {
          for (const node of nodes) {
            if (node.kind === "file") {
              try {
                const content = await readFile((node as FileNode).handle);
                const parsed = parseCriticMarkup(content);
                const { assignBlockIndices } =
                  await import("../services/blockIndex");
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
              } catch {
                // skip unreadable files
              }
            } else if (node.kind === "directory") {
              await scanNodes((node as DirectoryNode).children);
            }
          }
        };
        await scanNodes(tab.fileTree);
        // Preserve the active file's entry set by setComments
        const currentTab = get().tabs.find((t) => t.id === tabId);
        if (!currentTab) return;
        const activePath = currentTab.activeFilePath ?? currentTab.fileName;
        const merged = { ...result };
        if (activePath && currentTab.allFileComments[activePath]) {
          merged[activePath] = currentTab.allFileComments[activePath];
        }
        updateTab(get, set, tabId, () => ({ allFileComments: merged }));
      },

      navigateToComment: (filePath, rawStart) => {
        const tab = activeTab(get);
        if (!tab) return;
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
        const findFileNode = (nodes: FileTreeNode[]): FileNode | null => {
          for (const node of nodes) {
            if (node.kind === "file" && node.path === filePath) {
              return node as FileNode;
            }
            if (node.kind === "directory") {
              const found = findFileNode((node as DirectoryNode).children);
              if (found) return found;
            }
          }
          return null;
        };
        const fileNode = findFileNode(tab.fileTree);
        if (fileNode) {
          updateActiveTab(get, set, () => ({
            pendingScrollTarget: { filePath, rawStart },
          }));
          get().selectFile(fileNode);
        }
      },

      navigateToBlock: (filePath, blockIndex) => {
        const tab = activeTab(get);
        if (!tab) return;
        if (filePath === tab.activeFilePath) {
          scrollToBlock(blockIndex);
          return;
        }
        const findFileNode = (nodes: FileTreeNode[]): FileNode | null => {
          for (const node of nodes) {
            if (node.kind === "file" && node.path === filePath) {
              return node as FileNode;
            }
            if (node.kind === "directory") {
              const found = findFileNode((node as DirectoryNode).children);
              if (found) return found;
            }
          }
          return null;
        };
        const fileNode = findFileNode(tab.fileTree);
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
        if (!tab?.fileHandle) return;
        const comment = tab.comments.find((c) => c.id === id);
        if (!comment) return;
        const newRaw = applyDelete(tab.rawContent, comment);
        try {
          await writeFile(tab.fileHandle, newRaw);
          updateActiveTab(get, set, (t) => ({
            rawContent: newRaw,
            writeAllowed: true,
            undoState: { rawContent: t.rawContent },
          }));
        } catch (e) {
          if (isPermissionError(e))
            updateActiveTab(get, set, () => ({ writeAllowed: false }));
        }
      },

      editComment: async (id, type, text) => {
        const tab = activeTab(get);
        if (!tab?.fileHandle) return;
        const comment = tab.comments.find((c) => c.id === id);
        if (!comment) return;
        const newRaw = applyEdit(tab.rawContent, comment, type, text);
        try {
          await writeFile(tab.fileHandle, newRaw);
          updateActiveTab(get, set, (t) => ({
            rawContent: newRaw,
            writeAllowed: true,
            undoState: { rawContent: t.rawContent },
          }));
        } catch (e) {
          if (isPermissionError(e))
            updateActiveTab(get, set, () => ({ writeAllowed: false }));
        }
      },

      addComment: async (blockIndex, type, text) => {
        const tab = activeTab(get);
        if (!tab?.fileHandle) return;
        const { cleanMarkdown } = parseCriticMarkup(tab.rawContent);
        const newRaw = insertCommentService(
          tab.rawContent,
          tab.comments,
          cleanMarkdown,
          blockIndex,
          type,
          text,
        );
        try {
          await writeFile(tab.fileHandle, newRaw);
          updateActiveTab(get, set, (t) => ({
            rawContent: newRaw,
            writeAllowed: true,
            undoState: { rawContent: t.rawContent },
          }));
        } catch (e) {
          if (isPermissionError(e))
            updateActiveTab(get, set, () => ({ writeAllowed: false }));
        }
      },

      undo: async () => {
        const tab = activeTab(get);
        if (!tab?.undoState || !tab.fileHandle) return;
        try {
          await writeFile(tab.fileHandle, tab.undoState.rawContent);
          updateActiveTab(get, set, (t) => ({
            rawContent: t.undoState!.rawContent,
            undoState: null,
            writeAllowed: true,
          }));
        } catch (e) {
          if (isPermissionError(e))
            updateActiveTab(get, set, () => ({ writeAllowed: false }));
        }
      },

      clearUndo: () =>
        updateActiveTab(get, set, () => ({ undoState: null })),

      refreshFile: async () => {
        const tab = activeTab(get);
        if (!tab?.fileHandle) return;
        try {
          const newRaw = await readFile(tab.fileHandle);
          const newlyResolved = tab.comments.filter(
            (c) => !newRaw.includes(c.raw),
          );
          updateActiveTab(get, set, () => ({
            rawContent: newRaw,
            resolvedComments: newlyResolved,
          }));
        } catch {
          // file read failed — silent
        }
      },

      refreshFileTree: async () => {
        const tab = activeTab(get);
        if (!tab?.directoryHandle) return;
        const tabId = tab.id;
        try {
          const tree = await buildFileTree(tab.directoryHandle);
          updateTab(get, set, tabId, () => ({ fileTree: tree }));
          get().scanAllFileComments();
        } catch {
          // directory read failed — silent
        }
      },

      restoreTabs: async () => {
        const { tabs } = get();
        for (const tab of tabs) {
          if (!tab.directoryName) continue;
          try {
            const handle =
              await getHandle<FileSystemDirectoryHandle>(
                `tab:${tab.id}:directory`,
              );
            if (!handle) continue;
            const perm = await handle.queryPermission({ mode: "read" });
            if (perm !== "granted") continue;
            const tree = await buildFileTree(handle);
            updateTab(get, set, tab.id, () => ({
              directoryHandle: handle,
              directoryName: handle.name,
              fileTree: tree,
            }));
          } catch {
            // IndexedDB unavailable or handle expired — silent
          }
        }
        // Restore share sessions for all tabs
        const allShares = loadAllShares();
        for (const tab of get().tabs) {
          const tabShares = allShares[tab.id] ?? [];
          if (tabShares.length === 0) continue;
          const now = new Date();
          const restoredKeys: Record<string, CryptoKey> = {};
          for (const share of tabShares) {
            if (new Date(share.expiresAt) <= now) continue;
            try {
              const key = await base64urlToKey(share.keyB64);
              restoredKeys[share.docId] = key;
            } catch {
              // skip shares with invalid keys
            }
          }
          updateTab(get, set, tab.id, (t) => ({
            shares: tabShares,
            shareKeys: { ...t.shareKeys, ...restoredKeys },
          }));
        }
      },

      restoreShareSessions: async () => {
        const tab = activeTab(get);
        if (!tab) return;
        const now = new Date();
        const restoredKeys: Record<string, CryptoKey> = {};
        for (const share of tab.shares) {
          if (new Date(share.expiresAt) <= now) continue;
          try {
            const key = await base64urlToKey(share.keyB64);
            restoredKeys[share.docId] = key;
          } catch {
            // skip shares with invalid keys
          }
        }
        if (Object.keys(restoredKeys).length > 0) {
          updateActiveTab(get, set, (t) => ({
            shareKeys: { ...t.shareKeys, ...restoredKeys },
          }));
        }
      },

      // ── Global actions ────────────────────────────────────────────────

      setTheme: (theme) => set({ theme }),
      toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
      showToast: (msg) => set({ toast: msg }),
      dismissToast: () => set({ toast: null }),

      // ── Sharing actions (tab-scoped) ──────────────────────────────────

      shareContent: async ({ ttl, nodes, label: scopeLabel }) => {
        const storage = getStorage();
        if (!storage) throw new Error("Worker URL not configured");
        const tab = activeTab(get);
        if (!tab) throw new Error("No active tab");
        const tabId = tab.id;
        const label =
          scopeLabel ?? tab.directoryName ?? tab.fileName ?? "document";

        const tree: Record<string, string> = {};
        const sourceNodes =
          nodes ??
          (tab.directoryName && tab.fileTree.length > 0
            ? tab.fileTree
            : null);
        if (sourceNodes) {
          const readNode = async (items: FileTreeNode[]) => {
            for (const node of items) {
              if (node.kind === "file") {
                const path = node.path;
                if (path === tab.activeFilePath && tab.rawContent) {
                  tree[path] = tab.rawContent;
                } else {
                  try {
                    tree[path] = await readFile((node as FileNode).handle);
                  } catch (e) {
                    console.warn("[share] failed to read", path, e);
                  }
                }
              } else if (node.kind === "directory") {
                await readNode((node as DirectoryNode).children);
              }
            }
          };
          await readNode(sourceNodes);
        }
        if (Object.keys(tree).length === 0 && tab.rawContent) {
          const path =
            tab.activeFilePath ?? tab.fileName ?? "document.md";
          tree[path] = tab.rawContent;
        }

        const key = await generateKey();
        const { docId, hostSecret } = await storage.uploadContent(tree, key, {
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
        if (!currentTab) throw new Error("Tab disappeared");
        const shares = [...currentTab.shares, record];
        saveSharesForTab(tabId, shares);
        updateTab(get, set, tabId, (t) => ({
          shares,
          shareKeys: { ...t.shareKeys, [docId]: key },
          activeDocId: docId,
        }));

        return buildShareUrlFromOrigin({ docId, keyB64, name: label });
      },

      revokeShare: async (docId) => {
        const storage = getStorage();
        const tab = activeTab(get);
        if (!tab) return;
        const tabId = tab.id;
        const record = tab.shares.find((s) => s.docId === docId);
        if (!record) return;

        try {
          await storage?.deleteContent(docId, record.hostSecret);
        } catch {
          /* ignore if already gone */
        }
        try {
          await storage?.deleteComments(docId, record.hostSecret);
        } catch {
          /* ignore */
        }
        const updated = tab.shares.filter((s) => s.docId !== docId);
        saveSharesForTab(tabId, updated);
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
        if (!storage) throw new Error("Worker URL not configured");
        const tab = activeTab(get);
        if (!tab) throw new Error("No active tab");
        const record = tab.shares.find((s) => s.docId === docId);
        if (!record) throw new Error("Share not found");
        const key = tab.shareKeys[docId];
        if (!key)
          throw new Error(
            "Encryption key not available (session may have expired)",
          );

        const allowed = record.sharedPaths
          ? new Set(record.sharedPaths)
          : null;
        const tree: Record<string, string> = {};
        if (tab.fileTree.length > 0) {
          const readNode = async (items: FileTreeNode[]) => {
            for (const node of items) {
              if (node.kind === "file") {
                const path = node.path;
                if (allowed && !allowed.has(path)) continue;
                if (path === tab.activeFilePath && tab.rawContent) {
                  tree[path] = tab.rawContent;
                } else {
                  try {
                    tree[path] = await readFile((node as FileNode).handle);
                  } catch {
                    /* skip */
                  }
                }
              } else if (node.kind === "directory") {
                await readNode((node as DirectoryNode).children);
              }
            }
          };
          await readNode(tab.fileTree);
        }
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
        if (!storage) return;
        const tab = activeTab(get);
        if (!tab) return;
        const tabId = tab.id;
        const key = tab.shareKeys[docId];
        if (!key) return;
        const comments = await storage.fetchComments(docId, key);
        const currentTab = get().tabs.find((t) => t.id === tabId);
        if (!currentTab) return;
        const pc = { ...currentTab.pendingComments, [docId]: comments };
        const shares = currentTab.shares.map((s) =>
          s.docId === docId
            ? { ...s, pendingCommentCount: comments.length }
            : s,
        );
        saveSharesForTab(tabId, shares);
        updateTab(get, set, tabId, () => ({
          pendingComments: pc,
          shares,
        }));
      },

      mergeComment: async (docId, comment) => {
        const tab = activeTab(get);
        if (!tab?.fileHandle) return;
        const currentPath = tab.activeFilePath ?? tab.fileName ?? "";
        if (comment.path !== currentPath) return;

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
        try {
          await writeFile(tab.fileHandle, newRaw);
          updateActiveTab(get, set, (t) => ({
            rawContent: newRaw,
            writeAllowed: true,
            undoState: { rawContent: t.rawContent },
          }));
        } catch (e) {
          if (isPermissionError(e))
            updateActiveTab(get, set, () => ({ writeAllowed: false }));
        }
        get().dismissComment(docId, comment.id);
      },

      dismissComment: (docId, cmtId) => {
        const tab = activeTab(get);
        if (!tab) return;
        const tabId = tab.id;
        const pc = { ...tab.pendingComments };
        pc[docId] = (pc[docId] ?? []).filter((c) => c.id !== cmtId);
        const shares = tab.shares.map((s) =>
          s.docId === docId
            ? { ...s, pendingCommentCount: pc[docId].length }
            : s,
        );
        saveSharesForTab(tabId, shares);
        updateTab(get, set, tabId, () => ({
          pendingComments: pc,
          shares,
        }));
      },

      clearPendingComments: async (docId) => {
        const storage = getStorage();
        const tab = activeTab(get);
        if (!tab) return;
        const tabId = tab.id;
        const record = tab.shares.find((s) => s.docId === docId);
        if (record && storage) {
          try {
            await storage.deleteComments(docId, record.hostSecret);
          } catch {
            /* ignore */
          }
        }
        const pc = { ...tab.pendingComments };
        delete pc[docId];
        const shares = tab.shares.map((s) =>
          s.docId === docId ? { ...s, pendingCommentCount: 0 } : s,
        );
        saveSharesForTab(tabId, shares);
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
        if (!tab) return;
        if (get().isPeerMode) return;
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
        if (!sharedContent) return;
        const content = sharedContent.tree[path];
        if (content === undefined) return;
        set({
          peerRawContent: content,
          peerFileName: path,
          peerActiveFilePath: path,
          peerResolvedComments: [],
        });
      },

      loadSharedContent: async () => {
        const parsed = parseShareHash();
        if (!parsed) return;
        const { docId, keyB64 } = parsed;
        const storage = getStorage();
        if (!storage) return;
        try {
          const key = await base64urlToKey(keyB64);
          const payload = await storage.fetchContent(docId, key);
          const firstPath = Object.keys(payload.tree)[0];
          set({
            isPeerMode: true,
            sharedContent: payload,
            peerShareKeys: { ...get().peerShareKeys, [docId]: key },
            peerRawContent: firstPath ? payload.tree[firstPath] : "",
            peerFileName: firstPath ?? null,
            peerActiveFilePath: firstPath ?? null,
            peerActiveDocId: docId,
          });
        } catch (e) {
          set({ isPeerMode: true, sharedContent: null });
          console.error("[share] Failed to load shared content:", e);
        }
      },

      postPeerComment: async (blockIndex, type, text, path) => {
        const parsed = parseShareHash();
        if (!parsed) return;
        const { docId, keyB64 } = parsed;
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

        const storage = getStorage();
        if (storage) {
          const key =
            get().peerShareKeys[docId] ?? (await base64urlToKey(keyB64));
          await storage.postComment(docId, comment, key);
        }
      },

      deletePeerComment: (commentId) => {
        const { myPeerComments } = get();
        set({
          myPeerComments: myPeerComments.filter((c) => c.id !== commentId),
        });
      },

      editPeerComment: (commentId, type, text) => {
        const { myPeerComments } = get();
        const updated = myPeerComments.map((c) =>
          c.id === commentId ? { ...c, commentType: type, text } : c,
        );
        set({ myPeerComments: updated });
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
            } catch {
              // ignore migration errors for shares
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
              toast: null,
              isPeerMode: false,
              sharedContent: null,
              myPeerComments: [],
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
      }),
      merge: (persisted, current) => {
        if (typeof persisted !== "object" || persisted === null) return current;
        const merged = { ...current };
        // Restore persisted scalar fields
        if ("theme" in persisted) {
          const v = persisted.theme;
          if (v === "light" || v === "dark") merged.theme = v;
        }
        if ("activeTabId" in persisted) {
          const v = persisted.activeTabId;
          if (typeof v === "string" || v === null) merged.activeTabId = v;
        }
        if ("peerName" in persisted) {
          const v = persisted.peerName;
          if (typeof v === "string" || v === null) merged.peerName = v;
        }
        // Restore tabs, filling in default values for non-persisted fields
        if ("tabs" in persisted && Array.isArray(persisted.tabs)) {
          merged.tabs = persisted.tabs
            .filter(
              (t: unknown) =>
                typeof t === "object" && t !== null && "label" in t,
            )
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((t: any) =>
              createDefaultTab({
                label: typeof t.label === "string" ? t.label : "document",
                ...t,
              }),
            );
        }
        return merged;
      },
    },
  ),
);

// ── Debounced auto-push: sync active shares when rawContent changes ──
let _syncTimer: ReturnType<typeof setTimeout> | null = null;
let _prevRawContent = "";
let _prevActiveTabId: string | null = null;
useAppStore.subscribe((state) => {
  const tab = getActiveTab(state);
  if (!tab) return;

  // Reset tracking when switching tabs
  if (state.activeTabId !== _prevActiveTabId) {
    _prevActiveTabId = state.activeTabId;
    _prevRawContent = tab.rawContent;
    return;
  }

  const cur = tab.rawContent;
  if (cur === _prevRawContent) return;
  _prevRawContent = cur;
  if (state.isPeerMode) return;
  const now = new Date();
  const hasActive = tab.shares.some((s) => new Date(s.expiresAt) > now);
  if (!hasActive) return;
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    _syncTimer = null;
    useAppStore.getState().syncActiveShares();
  }, 2000);
});
