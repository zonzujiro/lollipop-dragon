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
import { connectRelay } from "../services/relay";
import type { RelayConnection } from "../services/relay";
import type { RelayMessage } from "../types/relay";
import { syncActiveShares as syncActiveSharesService, updateShare as updateShareService } from "../services/shareSync";
import {
  findLiveFileInTree,
  toFileTreeNodes,
  toPersistedTree,
} from "../types/fileTree";
import type {
  FileTreeNode,
  FileNode,
  HydratedSidebarTreeNode,
  SidebarTreeNode,
} from "../types/fileTree";
import type { Comment, CommentType } from "../types/criticmarkup";
import type { ShareRecord, SharePayload, PeerComment } from "../types/share";
import type { TabState, FileCommentEntry } from "../types/tab";
import { createDefaultTab } from "../types/tab";
import type { HistoryEntry } from "../types/history";
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

// ── History localStorage helpers ────────────────────────────────────────────

const HISTORY_KEY = "markreview-history";
const HISTORY_LIMIT = 20;
const HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}

async function migrateHandleToHistory(
  handleKey: string,
  historyEntryId: string,
  history: HistoryEntry[],
  get: () => AppState,
) {
  const h = await getHandle(handleKey);
  if (h) {
    await saveHandle(`history:${historyEntryId}`, h);
  }
  await removeHandle(handleKey);

  // Clean up evicted entries' handles
  const evicted = get().history.filter(
    (e) => !history.some((h) => h.id === e.id),
  );
  for (const ev of evicted) {
    await removeHandle(`history:${ev.id}`).catch((e) =>
      console.warn("[history] failed to remove evicted handle:", e),
    );
  }
}

function cleanExpiredHistory(): HistoryEntry[] {
  const entries = loadHistory();
  const cutoff = Date.now() - HISTORY_MAX_AGE_MS;
  const live = entries.filter((e) => new Date(e.closedAt).getTime() > cutoff);
  // Clean up IndexedDB handles for expired entries
  for (const e of entries) {
    if (new Date(e.closedAt).getTime() <= cutoff) {
      removeHandle(`history:${e.id}`).catch((err) =>
        console.warn("[history] failed to remove expired handle:", err),
      );
    }
  }
  if (live.length !== entries.length) {
    saveHistory(live);
  }
  return live;
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

  // Real-time relay
  rtStatus: "disconnected" | "connecting" | "connected";
  rtSocket: RelayConnection | null;
  rtSubscriptions: Set<string>;
  documentUpdateAvailable: boolean;
  remotePeerComments: PeerComment[];
  resolvedCommentIds: Set<string>;

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

  // History
  history: HistoryEntry[];
  historyDropdownOpen: boolean;
  reopenFromHistory: (entryId: string) => Promise<void>;
  removeHistoryEntry: (entryId: string) => void;
  clearHistory: () => void;
  toggleHistoryDropdown: () => void;

  // Tab management actions
  addTab: (tab: TabState) => void;
  removeTab: (tabId: string) => void;
  switchTab: (tabId: string) => Promise<void>;
  openFileInNewTab: () => Promise<void>;
  openDirectoryInNewTab: () => Promise<void>;
  reopenTab: (tabId: string) => Promise<void>;

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
  deleteAllComments: () => Promise<void>;
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
  fetchPendingComments: (docId: string) => Promise<void>;
  fetchAllPendingComments: () => Promise<void>;
  mergeComment: (docId: string, comment: PeerComment) => Promise<void>;
  dismissComment: (docId: string, cmtId: string) => void;
  clearPendingComments: (docId: string) => Promise<void>;
  toggleSharedPanel: () => void;

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

  // Relay actions
  setRtStatus: (status: "disconnected" | "connecting" | "connected") => void;
  openRelay: () => void;
  subscribeDoc: (docId: string) => void;
  unsubscribeDoc: (docId: string) => void;
  closeRelay: () => void;
  dismissDocumentUpdate: () => void;
}

function getStorage(): ShareStorage | null {
  return WORKER_URL ? new ShareStorage(WORKER_URL) : null;
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

// --- Peer mode message handler (module-level, returns a state patch) ---

function handlePeerMessage(message: RelayMessage, state: AppState): Partial<AppState> {
  if (message.type === "comment:added") {
    const isDuplicate = state.remotePeerComments.some(
      (comment) => comment.id === message.comment.id,
    );
    if (isDuplicate) {
      return {};
    }
    if (state.resolvedCommentIds.has(message.comment.id)) {
      return {};
    }
    return {
      remotePeerComments: [...state.remotePeerComments, message.comment],
    };
  }

  if (message.type === "comment:resolved") {
    const nextResolved = new Set(state.resolvedCommentIds);
    nextResolved.add(message.commentId);
    return {
      myPeerComments: state.myPeerComments.filter(
        (comment) => comment.id !== message.commentId,
      ),
      remotePeerComments: state.remotePeerComments.filter(
        (comment) => comment.id !== message.commentId,
      ),
      resolvedCommentIds: nextResolved,
    };
  }

  if (message.type === "document:updated") {
    return {
      documentUpdateAvailable: true,
    };
  }

  return {};
}

// --- Host mode message handler (module-level, uses functional set()) ---

function handleHostMessage(
  docId: string,
  message: RelayMessage,
  set: (fn: (state: AppState) => Partial<AppState>) => void,
): void {
  if (message.type === "comment:added") {
    set((state) => {
      const tabIndex = state.tabs.findIndex((tab) =>
        tab.shares.some((share) => share.docId === docId),
      );
      if (tabIndex === -1) {
        return {};
      }
      const targetTab = state.tabs[tabIndex];
      const existing = targetTab.pendingComments[docId] ?? [];
      if (existing.some((comment) => comment.id === message.comment.id)) {
        return {};
      }
      if (state.resolvedCommentIds.has(message.comment.id)) {
        return {};
      }
      const updatedComments = [...existing, message.comment];
      const updatedShares = targetTab.shares.map((share) =>
        share.docId === docId
          ? { ...share, pendingCommentCount: updatedComments.length }
          : share,
      );
      return {
        tabs: state.tabs.map((tab, index) =>
          index === tabIndex
            ? {
                ...tab,
                pendingComments: { ...tab.pendingComments, [docId]: updatedComments },
                shares: updatedShares,
              }
            : tab,
        ),
      };
    });
    return;
  }

  // document:updated and comment:resolved are not applicable in host mode
}

function removePendingCommentState(
  tab: TabState,
  docId: string,
  cmtId: string,
): Pick<TabState, "pendingComments" | "shares"> {
  const nextPendingComments = { ...tab.pendingComments };
  const remainingComments = (nextPendingComments[docId] ?? []).filter(
    (comment) => comment.id !== cmtId,
  );
  if (remainingComments.length > 0) {
    nextPendingComments[docId] = remainingComments;
  } else {
    delete nextPendingComments[docId];
  }
  const nextShares = tab.shares.map((share) =>
    share.docId === docId
      ? { ...share, pendingCommentCount: remainingComments.length }
      : share,
  );
  return {
    pendingComments: nextPendingComments,
    shares: nextShares,
  };
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

function getLiveFileTree(tab: TabState): FileTreeNode[] {
  return toFileTreeNodes(tab.fileTree);
}

function needsDirectoryTabRestore(tab: TabState): boolean {
  const isMissingDirectoryHandle = tab.directoryHandle === null;
  const isMissingLiveFileTree = getLiveFileTree(tab).length === 0;
  const isMissingActiveFileHandle =
    tab.activeFilePath !== null && tab.fileHandle === null;

  return (
    isMissingDirectoryHandle ||
    isMissingLiveFileTree ||
    isMissingActiveFileHandle
  );
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

async function restoreDirectoryTabState(
  get: () => AppState,
  set: (
    partial: Partial<AppState> | ((s: AppState) => Partial<AppState>),
  ) => void,
  tabId: string,
): Promise<void> {
  const tab = get().tabs.find((currentTab) => currentTab.id === tabId);
  if (!tab?.directoryName) {
    return;
  }

  try {
    const handle = await getHandle<FileSystemDirectoryHandle>(
      `tab:${tab.id}:directory`,
    );
    if (!handle) {
      console.debug(
        "[restoreDirectoryTabState] no saved directory handle:",
        tab.id,
        tab.directoryName,
      );
      updateTab(get, set, tab.id, () => ({
        restoreError: `The folder "${tab.directoryName}" could not be accessed. It may have been moved, renamed, or deleted.`,
      }));
      return;
    }

    let readPermission = await handle.queryPermission({ mode: "read" });
    if (readPermission !== "granted") {
      readPermission = await handle.requestPermission({ mode: "read" });
    }
    if (readPermission !== "granted") {
      console.debug(
        "[restoreDirectoryTabState] directory permission not granted:",
        {
          tabId: tab.id,
          directoryName: tab.directoryName,
          readPermission,
        },
      );
      updateTab(get, set, tab.id, () => ({
        restoreError: `The folder "${tab.directoryName}" requires permission to access. Please reopen it.`,
      }));
      return;
    }

    const tree = await buildFileTree(handle);
    let restoredFileHandle: FileSystemFileHandle | null = null;
    let restoredFileName: string | null = null;
    let restoredRaw: string | null = null;

    if (tab.activeFilePath) {
      const fileNode = findLiveFileInTree(tree, tab.activeFilePath);
      if (fileNode) {
        restoredFileHandle = fileNode.handle;
        restoredFileName = fileNode.name;
        try {
          restoredRaw = await readFile(fileNode.handle);
        } catch (e) {
          console.warn(
            "[restoreDirectoryTabState] file read failed, keeping persisted content:",
            e,
          );
        }
      }
    }

    updateTab(get, set, tab.id, () => ({
      directoryHandle: handle,
      directoryName: handle.name,
      fileTree: tree,
      restoreError: null,
      ...(restoredFileHandle ? { fileHandle: restoredFileHandle } : {}),
      ...(restoredFileName ? { fileName: restoredFileName } : {}),
      ...(restoredRaw !== null ? { rawContent: restoredRaw } : {}),
    }));

    if (get().activeTabId === tab.id && tree.length > 0) {
      await get().scanAllFileComments();
    }
  } catch (e) {
    const name = tab?.directoryName ?? "unknown";
    console.error(
      "[restoreDirectoryTabState] failed to restore directory tab:",
      tabId,
      e,
    );
    updateTab(get, set, tabId, () => ({
      directoryHandle: null,
      fileHandle: null,
      restoreError: `The folder "${name}" could not be accessed. It may have been moved, renamed, or deleted.`,
    }));
  }
}

/** Find an existing tab whose handle matches via isSameEntry. */
async function findTabByHandle(
  tabs: TabState[],
  handle: FileSystemFileHandle | FileSystemDirectoryHandle,
  kind: "file" | "directory",
): Promise<TabState | null> {
  for (const tab of tabs) {
    const existing = kind === "file" ? tab.fileHandle : tab.directoryHandle;
    if (existing && (await existing.isSameEntry(handle))) {
      return tab;
    }
  }
  return null;
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

      // Real-time relay
      rtStatus: "disconnected",
      rtSocket: null,
      rtSubscriptions: new Set(),
      documentUpdateAvailable: false,
      remotePeerComments: [],
      resolvedCommentIds: new Set(),

      hoveredBlockHighlight: null,
      setHoveredBlockHighlight: (highlight) =>
        set({ hoveredBlockHighlight: highlight }),

      // ── History ───────────────────────────────────────────────────────────

      history: loadHistory(),
      historyDropdownOpen: false,

      toggleHistoryDropdown: () =>
        set((s) => ({ historyDropdownOpen: !s.historyDropdownOpen })),

      reopenFromHistory: async (entryId) => {
        const entry = get().history.find((e) => e.id === entryId);
        if (!entry) {
          return;
        }
        const handle = await getHandle(`history:${entryId}`);
        if (!handle) {
          // Handle gone — remove entry and notify
          const updated = get().history.filter((e) => e.id !== entryId);
          saveHistory(updated);
          set({ history: updated });
          get().showToast("File access expired — please reopen manually");
          return;
        }

        // Request permission (requires user gesture — this is called from a click)
        let writeAllowed = false;
        try {
          const writePerm = await (
            handle as FileSystemFileHandle
          ).requestPermission({ mode: "readwrite" });
          writeAllowed = writePerm === "granted";
        } catch {
          // readwrite not supported or denied
        }
        if (!writeAllowed) {
          try {
            const readPerm = await (
              handle as FileSystemFileHandle
            ).requestPermission({ mode: "read" });
            if (readPerm !== "granted") {
              get().showToast("Permission denied");
              return;
            }
          } catch {
            get().showToast("Permission denied");
            return;
          }
        }

        if (entry.type === "directory") {
          const dirHandle = handle as FileSystemDirectoryHandle;
          const tab = createDefaultTab({
            label: entry.name,
            directoryHandle: dirHandle,
            directoryName: entry.name,
            sidebarOpen: true,
            writeAllowed,
          });
          get().addTab(tab);
          await saveHandle(`tab:${tab.id}:directory`, dirHandle);
          const tree = await buildFileTree(dirHandle);
          updateTab(get, set, tab.id, () => ({ fileTree: tree }));

          // Restore previously active file if available
          if (entry.activeFilePath) {
            const fileNode = findLiveFileInTree(tree, entry.activeFilePath);
            if (fileNode) {
              const raw = await readFile(fileNode.handle);
              updateTab(get, set, tab.id, () => ({
                fileHandle: fileNode.handle,
                fileName: fileNode.name,
                rawContent: raw,
                activeFilePath: fileNode.path,
              }));
            }
          }

          // Scan comments
          if (get().activeTabId === tab.id) {
            get().scanAllFileComments();
          }
        } else {
          const fileHandle = handle as FileSystemFileHandle;
          const raw = await readFile(fileHandle);
          const tab = createDefaultTab({
            label: entry.name,
            fileHandle,
            fileName: entry.name,
            rawContent: raw,
            writeAllowed,
          });
          get().addTab(tab);
          await saveHandle(`tab:${tab.id}:file`, fileHandle);
        }

        // Remove from history and clean up history handle
        const updated = get().history.filter((e) => e.id !== entryId);
        saveHistory(updated);
        set({ history: updated, historyDropdownOpen: false });
        removeHandle(`history:${entryId}`).catch((e) =>
          console.warn("[history] failed to remove handle:", e),
        );

        // Restore shares (they reconnect via stableKey)
        const allShares = loadAndCleanShares(get().tabs);
        const currentTab = activeTab(get);
        if (currentTab) {
          const tabShares = allShares[stableShareKey(currentTab)] ?? [];
          if (tabShares.length > 0) {
            const restoredKeys = await restoreShareKeys(tabShares);
            updateActiveTab(get, set, (t) => ({
              shares: tabShares,
              shareKeys: { ...t.shareKeys, ...restoredKeys },
            }));
          }
        }
      },

      removeHistoryEntry: (entryId) => {
        const updated = get().history.filter((e) => e.id !== entryId);
        saveHistory(updated);
        set({ history: updated });
        removeHandle(`history:${entryId}`).catch((e) =>
          console.warn("[history] failed to remove handle:", e),
        );
      },

      clearHistory: () => {
        const entries = get().history;
        for (const e of entries) {
          removeHandle(`history:${e.id}`).catch((err) =>
            console.warn("[history] failed to remove handle:", err),
          );
        }
        saveHistory([]);
        set({ history: [], historyDropdownOpen: false });
      },

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
        const tab = tabs[idx];
        const updated = tabs.filter((t) => t.id !== tabId);
        const docIdsToUnsubscribe = tab.shares
          .map((share) => share.docId)
          .filter(
            (docId) =>
              !updated.some((currentTab) =>
                currentTab.shares.some((share) => share.docId === docId),
              ),
          );
        let newActiveId: string | null = null;
        if (updated.length > 0) {
          if (activeTabId === tabId) {
            const newIdx = Math.min(idx, updated.length - 1);
            newActiveId = updated[newIdx].id;
          } else {
            newActiveId = activeTabId;
          }
        }

        // Archive to history
        const isDir = !!tab.directoryName;
        const name = tab.directoryName ?? tab.fileName;
        if (name) {
          const hasActiveShares = tab.shares.some(
            (s) => new Date(s.expiresAt) > new Date(),
          );
          const entry: HistoryEntry = {
            id: crypto.randomUUID(),
            type: isDir ? "directory" : "file",
            name,
            stableKey: stableShareKey(tab),
            closedAt: new Date().toISOString(),
            activeFilePath: tab.activeFilePath,
            hasActiveShares,
          };

          // Deduplicate by stableKey, enforce limit
          let history = get().history.filter(
            (e) => e.stableKey !== entry.stableKey,
          );
          history = [entry, ...history].slice(0, HISTORY_LIMIT);

          // Move handle from tab: key to history: key (fire-and-forget)
          const handleKey = isDir
            ? `tab:${tabId}:directory`
            : `tab:${tabId}:file`;
          migrateHandleToHistory(handleKey, entry.id, history, get).catch((e) =>
            console.warn("[history] handle migration failed:", e),
          );

          saveHistory(history);
          set({ tabs: updated, activeTabId: newActiveId, history });
        } else {
          // No name — nothing to archive, just clean up
          removeHandle(`tab:${tabId}:directory`).catch((e) =>
            console.warn("[handleStore] cleanup failed:", e),
          );
          removeHandle(`tab:${tabId}:file`).catch((e) =>
            console.warn("[handleStore] cleanup failed:", e),
          );
          set({ tabs: updated, activeTabId: newActiveId });
        }
        for (const docId of docIdsToUnsubscribe) {
          get().unsubscribeDoc(docId);
        }
      },

      switchTab: async (tabId) => {
        set({ activeTabId: tabId });
        const tab = get().tabs.find((currentTab) => currentTab.id === tabId);
        if (!tab?.directoryName) {
          return;
        }

        const shouldRestoreDirectoryTab = needsDirectoryTabRestore(tab);
        if (!shouldRestoreDirectoryTab) {
          return;
        }

        await restoreDirectoryTabState(get, set, tabId);
      },

      openFileInNewTab: async () => {
        const result = await fsOpenFile();
        if (!result) {
          return;
        }
        const existing = await findTabByHandle(
          get().tabs,
          result.handle,
          "file",
        );
        if (existing) {
          set({ activeTabId: existing.id });
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
        const existing = await findTabByHandle(
          get().tabs,
          result.handle,
          "directory",
        );
        if (existing) {
          set({ activeTabId: existing.id });
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

      reopenTab: async (tabId: string) => {
        const tab = get().tabs.find((t) => t.id === tabId);
        if (!tab) {
          return;
        }

        if (tab.directoryName) {
          try {
            const result = await fsOpenDirectory();
            if (!result) {
              return;
            }
            await saveHandle(`tab:${tabId}:directory`, result.handle);
            const tree = await buildFileTree(result.handle);
            updateTab(get, set, tabId, () => ({
              directoryHandle: result.handle,
              directoryName: result.name,
              label: result.name,
              fileTree: tree,
              fileHandle: null,
              fileName: null,
              rawContent: "",
              activeFilePath: null,
              restoreError: null,
            }));
            if (get().activeTabId === tabId && tree.length > 0) {
              await get().scanAllFileComments();
            }
          } catch (e) {
            console.error(
              "[reopenTab] failed to reopen directory tab:",
              tabId,
              e,
            );
            updateTab(get, set, tabId, () => ({
              restoreError: `The folder "${tab.directoryName}" could not be opened. Please try again.`,
            }));
          }
        } else {
          try {
            const result = await fsOpenFile();
            if (!result) {
              return;
            }
            await saveHandle(`tab:${tabId}:file`, result.handle);
            const raw = await readFile(result.handle);
            updateTab(get, set, tabId, () => ({
              fileHandle: result.handle,
              fileName: result.name,
              label: result.name,
              rawContent: raw,
              restoreError: null,
            }));
          } catch (e) {
            console.error("[reopenTab] failed to reopen file tab:", tabId, e);
            updateTab(get, set, tabId, () => ({
              restoreError: `The file "${tab.fileName}" could not be opened. Please try again.`,
            }));
          }
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
        const fileNode = findLiveFileInTree(tab.fileTree, filePath);
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
        const fileNode = findLiveFileInTree(tab.fileTree, filePath);
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
            syncActiveSharesService();
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
        // Prune expired history entries
        const cleanedHistory = cleanExpiredHistory();
        set({ history: cleanedHistory });

        const { tabs } = get();
        for (const tab of tabs) {
          if (tab.directoryName) {
            try {
              await restoreDirectoryTabState(get, set, tab.id);
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
                console.warn(
                  "[restoreTabs] no handle in IndexedDB for file tab:",
                  tab.id,
                  tab.fileName,
                );
                updateTab(get, set, tab.id, () => ({
                  restoreError: `The file "${tab.fileName}" could not be accessed. It may have been moved, renamed, or deleted.`,
                }));
                continue;
              }
              let writePerm = await handle.queryPermission({
                mode: "readwrite",
              });
              if (writePerm !== "granted") {
                writePerm = await handle.requestPermission({
                  mode: "readwrite",
                });
              }
              console.log("[restoreTabs] file tab permissions", {
                tabId: tab.id,
                fileName: tab.fileName,
                writePerm,
              });
              if (writePerm !== "granted") {
                console.warn(
                  "[restoreTabs] skipping file tab — readwrite not granted:",
                  tab.id,
                  tab.fileName,
                );
                updateTab(get, set, tab.id, () => ({
                  restoreError: `The file "${tab.fileName}" requires permission to access. Please reopen it.`,
                }));
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
                restoreError: null,
                ...(restoredRaw !== null ? { rawContent: restoredRaw } : {}),
              }));
              console.log(
                "[restoreTabs] file tab restored successfully:",
                tab.id,
                tab.fileName,
              );
            } catch (e) {
              console.error(
                "[restoreTabs] failed to restore file tab:",
                tab.id,
                e,
              );
              updateTab(get, set, tab.id, () => ({
                restoreError: `The file "${tab.fileName}" could not be accessed. It may have been moved, renamed, or deleted.`,
              }));
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

        // Auto-connect relay for active shares
        const restoredState = get();
        const allActiveShares = restoredState.tabs.flatMap((tab) => tab.shares);
        const now = new Date();
        const nonExpiredShares = allActiveShares.filter(
          (share) => new Date(share.expiresAt) > now,
        );
        if (nonExpiredShares.length > 0) {
          get().openRelay();
          for (const share of nonExpiredShares) {
            get().subscribeDoc(share.docId);
          }
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
        const liveFileTree = getLiveFileTree(tab);

        const sourceNodes =
          nodes ??
          (tab.directoryName && liveFileTree.length > 0 ? liveFileTree : null);
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

        get().openRelay();
        get().subscribeDoc(docId);

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
        get().unsubscribeDoc(docId);
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

      fetchAllPendingComments: async () => {
        const tab = activeTab(get);
        if (!tab) {
          return;
        }
        const active = tab.shares.filter(
          (s) => new Date(s.expiresAt) > new Date(),
        );
        for (const share of active) {
          await get().fetchPendingComments(share.docId);
        }
      },

      mergeComment: async (docId, comment) => {
        const tab = activeTab(get);
        if (!tab?.fileHandle) {
          console.error("[mergeComment] no active tab or fileHandle", {
            hasTab: !!tab,
            hasHandle: !!tab?.fileHandle,
            tabId: tab?.id,
            activeTabId: get().activeTabId,
            tabFileName: tab?.fileName,
            allTabs: get().tabs.map((t) => ({
              id: t.id,
              fileName: t.fileName,
              hasHandle: !!t.fileHandle,
            })),
          });
          return;
        }
        const currentPath = tab.activeFilePath ?? tab.fileName ?? "";
        if (comment.path !== currentPath) {
          console.error("[mergeComment] path mismatch", {
            commentPath: comment.path,
            currentPath,
          });
          return;
        }

        const readPerm = await tab.fileHandle.queryPermission({
          mode: "read",
        });
        const writePerm = await tab.fileHandle.queryPermission({
          mode: "readwrite",
        });
        console.log("[mergeComment] proceeding", {
          tabId: tab.id,
          fileName: tab.fileName,
          activeFilePath: tab.activeFilePath,
          readPerm,
          writePerm,
          commentPath: comment.path,
          blockIndex: comment.blockRef.blockIndex,
        });

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
        if (newRaw === tab.rawContent) {
          console.error("[mergeComment] insert had no effect", {
            blockIndex: comment.blockRef.blockIndex,
            commentType: comment.commentType,
            contentLength: tab.rawContent.length,
          });
        }
        await writeAndUpdate(get, set, tab.fileHandle, newRaw);

        // Durable resolve sequence: KV must be durable before relay broadcast
        const record = tab.shares.find((share) => share.docId === docId);
        let kvDurable = false;
        if (record) {
          const storage = getStorage();
          if (storage) {
            try {
              await storage.deleteComment(docId, comment.id, record.hostSecret);
              await updateShareService(docId);
              kvDurable = true;
            } catch (durableError) {
              console.warn("[mergeComment] durable resolve sequence failed:", durableError);
            }
          }
        }

        // Step 3: Broadcast only if KV is durable
        if (kvDurable) {
          try {
            const { rtSocket: relaySocket } = get();
            if (relaySocket) {
              relaySocket.send(docId, {
                type: "comment:resolved",
                commentId: comment.id,
              }).catch((relayError) => {
                console.warn("[relay] resolve broadcast failed:", relayError);
              });
            }
          } catch (relayError) {
            console.warn("[relay] resolve broadcast setup failed:", relayError);
          }
        }

        // Remove from pending state directly — dismissComment would re-delete from KV
        const latestTab = activeTab(get);
        if (latestTab) {
          const nextTabState = removePendingCommentState(latestTab, docId, comment.id);
          saveShares(stableShareKey(latestTab), nextTabState.shares);
          updateTab(get, set, latestTab.id, () => nextTabState);
        }

        set((state) => {
          const nextResolvedCommentIds = new Set(state.resolvedCommentIds);
          nextResolvedCommentIds.add(comment.id);
          return { resolvedCommentIds: nextResolvedCommentIds };
        });
      },

      dismissComment: (docId, cmtId) => {
        const tab = activeTab(get);
        if (!tab) {
          return;
        }
        const tabId = tab.id;
        const nextTabState = removePendingCommentState(tab, docId, cmtId);
        saveShares(stableShareKey(tab), nextTabState.shares);
        updateTab(get, set, tabId, () => nextTabState);

        const record = tab.shares.find((s) => s.docId === docId);
        const storage = getStorage();
        if (record && storage) {
          storage.deleteComment(docId, cmtId, record.hostSecret).catch((error) => {
            console.warn("[dismissComment] per-comment KV delete failed:", error);
          });
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
        const pendingForDoc = tab.pendingComments[docId] ?? [];
        if (record && storage) {
          for (const pendingComment of pendingForDoc) {
            try {
              await storage.deleteComment(docId, pendingComment.id, record.hostSecret);
            } catch (error) {
              console.error(
                "[clearPendingComments] failed to delete comment:",
                docId,
                pendingComment.id,
                error,
              );
            }
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

          get().openRelay();
          get().subscribeDoc(docId);
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

        // Broadcast each comment to connected peers via relay
        try {
          const { rtSocket, peerActiveDocId } = get();
          if (rtSocket && peerActiveDocId) {
            for (const comment of unsubmitted) {
              await rtSocket.send(peerActiveDocId, { type: "comment:added", comment });
            }
          }
        } catch (relayError) {
          console.warn("[relay] broadcast failed during syncPeerComments:", relayError);
        }
      },

      // ── Relay actions ──────────────────────────────────────────────────

      setRtStatus: (status) => set({ rtStatus: status }),

      openRelay: () => {
        const currentState = get();
        if (currentState.rtSocket) {
          return;
        }

        const relay = connectRelay(
          (docId, message) => {
            const state = get();
            if (state.isPeerMode) {
              const patch = handlePeerMessage(message, state);
              set(patch);
            } else {
              handleHostMessage(docId, message, set);
            }
          },
          (status) => {
            set({ rtStatus: status });
            if (status === "connected") {
              const reconnectedState = get();
              if (reconnectedState.isPeerMode) {
                // Peer mode catch-up: re-fetch comments from KV and reload shared content
                const peerDocId = reconnectedState.peerActiveDocId;
                const peerKey = peerDocId ? reconnectedState.peerShareKeys[peerDocId] : null;
                if (peerDocId && peerKey) {
                  const storage = getStorage();
                  if (storage) {
                    storage.fetchComments(peerDocId, peerKey).then((comments) => {
                      const latestState = get();
                      const ownIds = new Set(latestState.myPeerComments.map((comment) => comment.id));
                      const submittedIds = new Set(latestState.submittedPeerCommentIds);
                      const remoteIds = new Set(latestState.remotePeerComments.map((comment) => comment.id));
                      const newComments = comments.filter(
                        (comment) =>
                          !ownIds.has(comment.id) &&
                          !submittedIds.has(comment.id) &&
                          !remoteIds.has(comment.id) &&
                          !latestState.resolvedCommentIds.has(comment.id),
                      );
                      if (newComments.length > 0) {
                        set((state) => ({
                          remotePeerComments: [...state.remotePeerComments, ...newComments],
                        }));
                      }
                    }).catch((error) => {
                      console.warn("[relay] peer comment catch-up failed:", error);
                    });
                  }
                }
                reconnectedState.loadSharedContent().catch((error) => {
                  console.warn("[relay] peer content catch-up failed:", error);
                });
              } else {
                // KNOWN LIMITATION (v1): Only catches up the active tab's shares.
                // Background tabs recover when the user switches to them.
                // See spec §5.3 and §9 for details.
                reconnectedState.fetchAllPendingComments().catch((error) => {
                  console.warn("[relay] host reconnect catch-up failed:", error);
                });
              }
            }
          },
          (docId, ok) => {
            if (ok) {
              const next = new Set(get().rtSubscriptions);
              next.add(docId);
              set({ rtSubscriptions: next });
            }
          },
        );

        set({ rtSocket: relay });
      },

      subscribeDoc: (docId) => {
        const { rtSocket } = get();
        if (!rtSocket) {
          return;
        }
        const state = get();
        let key: CryptoKey | undefined;
        if (state.isPeerMode) {
          key = state.peerShareKeys[docId];
        } else {
          for (const tab of state.tabs) {
            if (tab.shareKeys[docId]) {
              key = tab.shareKeys[docId];
              break;
            }
          }
        }
        if (!key) {
          console.warn("[relay] no key for docId:", docId);
          return;
        }
        rtSocket.subscribe(docId, key);
      },

      unsubscribeDoc: (docId) => {
        const { rtSocket, rtSubscriptions } = get();
        if (!rtSocket) {
          return;
        }
        rtSocket.unsubscribe(docId);
        const next = new Set(rtSubscriptions);
        next.delete(docId);
        // Don't auto-close the relay when subscriptions are empty:
        // the relay service may still have pending (unconfirmed) subscriptions.
        // The relay stays open until explicitly closed via closeRelay() or beforeunload.
        set({ rtSubscriptions: next });
      },

      closeRelay: () => {
        const { rtSocket } = get();
        if (rtSocket) {
          rtSocket.close();
        }
        set({ rtSocket: null, rtStatus: "disconnected", rtSubscriptions: new Set() });
      },

      dismissDocumentUpdate: () => {
        set({ documentUpdateAvailable: false });
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
          fileTree: toPersistedTree(t.fileTree),
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
              createDefaultTab({
                ...t,
                label: t.label ?? "document",
                fileTree: getPersistedTabFileTree(t),
              }),
            )
          : current.tabs;
        const rtStatusDefault: "disconnected" = "disconnected";
        return {
          ...current,
          ...p,
          tabs,
          submittedPeerCommentIds: Array.isArray(p.submittedPeerCommentIds)
            ? p.submittedPeerCommentIds
            : [],
          // Transient relay state must always reset on load
          rtStatus: rtStatusDefault,
          rtSocket: null,
          rtSubscriptions: new Set<string>(),
          documentUpdateAvailable: false,
          remotePeerComments: [],
          resolvedCommentIds: new Set<string>(),
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
