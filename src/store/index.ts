import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  openFile as fsOpenFile,
  openDirectory as fsOpenDirectory,
  readFile,
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
import {
  RealtimeSession,
  docIdToRoomId,
  generateRoomPassword,
} from "../services/realtime";
import type { ConnectionStatus, PeerInfo } from "../services/realtime";
import type { FileTreeNode, FileNode, DirectoryNode } from "../types/fileTree";
import type { Comment, CommentType } from "../types/criticmarkup";
import type { ShareRecord, SharePayload, PeerComment } from "../types/share";

const WORKER_URL = import.meta.env.VITE_WORKER_URL as string | undefined;
const SHARES_KEY = "markreview-shares";

function loadShares(): ShareRecord[] {
  try {
    return JSON.parse(localStorage.getItem(SHARES_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveShares(shares: ShareRecord[]) {
  localStorage.setItem(SHARES_KEY, JSON.stringify(shares));
}

interface FileCommentEntry {
  filePath: string;
  fileName: string;
  comments: Comment[];
}

interface AppState {
  // Single file
  fileHandle: FileSystemFileHandle | null;
  fileName: string | null;
  rawContent: string;

  // Folder
  directoryHandle: FileSystemDirectoryHandle | null;
  directoryName: string | null;
  fileTree: FileTreeNode[];
  activeFilePath: string | null;
  sidebarOpen: boolean;

  // Comments (derived from rawContent by MarkdownRenderer)
  comments: Comment[];
  resolvedComments: Comment[];
  activeCommentId: string | null;
  commentPanelOpen: boolean;
  commentFilter: CommentType | "all" | "pending" | "resolved";

  // Cross-file comment cache
  allFileComments: Record<string, FileCommentEntry>;
  pendingScrollTarget: { filePath: string; rawStart: number } | null;

  // UI
  theme: "light" | "dark";
  focusMode: boolean;
  writeAllowed: boolean;
  undoState: { rawContent: string } | null;
  toast: string | null;

  // Sharing (v2)
  shares: ShareRecord[];
  sharedPanelOpen: boolean;
  isPeerMode: boolean;
  peerName: string | null;
  sharedContent: SharePayload | null;
  // Peer's own submitted comments (peer mode only)
  myPeerComments: PeerComment[];
  // docId → decrypted comments fetched from Worker
  pendingComments: Record<string, PeerComment[]>;
  // docId → CryptoKey (in-memory only, not persisted)
  shareKeys: Record<string, CryptoKey>;

  // Real-time (v3)
  rtStatus: ConnectionStatus;
  rtPeers: PeerInfo[];
  rtSession: RealtimeSession | null;
  rtDocId: string | null;
  contentUpdateAvailable: boolean;

  // v1 Actions
  openFile: () => Promise<void>;
  openDirectory: () => Promise<void>;
  selectFile: (node: FileNode) => Promise<void>;
  clearFile: () => void;
  setComments: (comments: Comment[]) => void;
  setActiveCommentId: (id: string | null) => void;
  toggleCommentPanel: () => void;
  setCommentFilter: (f: CommentType | "all" | "pending" | "resolved") => void;
  toggleSidebar: () => void;
  setTheme: (theme: "light" | "dark") => void;
  toggleFocusMode: () => void;
  restoreDirectory: () => Promise<void>;
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
  showToast: (msg: string) => void;
  dismissToast: () => void;
  scanAllFileComments: () => Promise<void>;
  navigateToComment: (filePath: string, rawStart: number) => void;
  clearPendingScrollTarget: () => void;
  restoreRealtimeSessions: () => Promise<void>;

  // v2 Sharing actions
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

  // v2 Peer actions
  setPeerName: (name: string) => void;
  loadSharedContent: () => Promise<void>;
  selectPeerFile: (path: string) => void;
  postPeerComment: (
    blockIndex: number,
    type: CommentType,
    text: string,
    path: string,
  ) => Promise<void>;

  // Auto-sync
  syncActiveShares: () => Promise<void>;

  // v3 Real-time actions
  connectRealtime: (docId: string, roomPassword: string) => void;
  disconnectRealtime: () => void;
  setRealtimeAwareness: (
    activeFile: string | null,
    focusedBlock: number | null,
  ) => void;
  dismissContentUpdate: () => void;
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

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      fileHandle: null,
      fileName: null,
      rawContent: "",
      directoryHandle: null,
      directoryName: null,
      fileTree: [],
      activeFilePath: null,
      sidebarOpen: true,
      comments: [],
      resolvedComments: [],
      activeCommentId: null,
      commentPanelOpen: false,
      commentFilter: "all",
      allFileComments: {},
      pendingScrollTarget: null,
      theme: "light",
      focusMode: false,
      writeAllowed: true,
      undoState: null,
      toast: null,
      shares: loadShares(),
      sharedPanelOpen: false,
      isPeerMode: false,
      peerName: null,
      sharedContent: null,
      myPeerComments: [],
      pendingComments: {},
      shareKeys: {},
      rtStatus: "disconnected" as ConnectionStatus,
      rtPeers: [],
      rtSession: null,
      rtDocId: null,
      contentUpdateAvailable: false,

      // ── v1 actions ──────────────────────────────────────────────────────

      openFile: async () => {
        const result = await fsOpenFile();
        if (!result) return;
        const raw = await readFile(result.handle);
        await removeHandle("directory");
        set({
          fileHandle: result.handle,
          fileName: result.name,
          rawContent: raw,
          directoryHandle: null,
          directoryName: null,
          fileTree: [],
          activeFilePath: null,
          resolvedComments: [],
        });
      },

      openDirectory: async () => {
        const result = await fsOpenDirectory();
        if (!result) return;
        await saveHandle("directory", result.handle);
        set({
          fileHandle: null,
          fileName: null,
          rawContent: "",
          activeFilePath: null,
          directoryHandle: result.handle,
          directoryName: result.name,
          fileTree: [],
          sidebarOpen: true,
        });
        const tree = await buildFileTree(result.handle);
        set({ fileTree: tree });
        get().scanAllFileComments();
      },

      selectFile: async (node: FileNode) => {
        const raw = await readFile(node.handle);
        set({
          fileHandle: node.handle,
          fileName: node.name,
          rawContent: raw,
          activeFilePath: node.path,
          resolvedComments: [],
        });
      },

      clearFile: () =>
        set({
          fileHandle: null,
          fileName: null,
          rawContent: "",
          directoryHandle: null,
          directoryName: null,
          fileTree: [],
          activeFilePath: null,
        }),

      setComments: (comments) => {
        const { activeFilePath, fileName, allFileComments } = get();
        const path = activeFilePath ?? fileName;
        const updated = path
          ? {
              ...allFileComments,
              [path]: {
                filePath: path,
                fileName: path.split("/").pop() ?? path,
                comments: comments.map((c) => ({ ...c, filePath: path })),
              },
            }
          : allFileComments;
        set({
          comments,
          activeCommentId: null,
          commentFilter: "all",
          allFileComments: updated,
        });
      },
      setActiveCommentId: (id) => set({ activeCommentId: id }),
      toggleCommentPanel: () =>
        set((s) => ({
          commentPanelOpen: !s.commentPanelOpen,
          sharedPanelOpen: !s.commentPanelOpen ? false : s.sharedPanelOpen,
        })),
      setCommentFilter: (f) => set({ commentFilter: f, activeCommentId: null }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setTheme: (theme) => set({ theme }),
      toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),

      scanAllFileComments: async () => {
        const { fileTree } = get();
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
        await scanNodes(fileTree);
        // Preserve the active file's entry set by setComments (source of
        // truth for the currently-rendered file) — the scan is async and
        // may complete after setComments already ran.
        const { allFileComments: existing, activeFilePath, fileName } = get();
        const activePath = activeFilePath ?? fileName;
        const merged = { ...result };
        if (activePath && existing[activePath]) {
          merged[activePath] = existing[activePath];
        }
        set({ allFileComments: merged });
      },

      navigateToComment: (filePath, rawStart) => {
        const { activeFilePath, comments, fileTree } = get();
        if (filePath === activeFilePath) {
          // Same file — find and activate the comment
          const comment = comments.find((c) => c.rawStart === rawStart);
          if (comment) {
            set({ activeCommentId: comment.id });
            scrollToBlock(comment.blockIndex);
          }
          return;
        }
        // Different file — find the FileNode, set pending scroll target, then selectFile
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
        const fileNode = findFileNode(fileTree);
        if (fileNode) {
          set({ pendingScrollTarget: { filePath, rawStart } });
          get().selectFile(fileNode);
        }
      },

      clearPendingScrollTarget: () => set({ pendingScrollTarget: null }),

      deleteComment: async (id) => {
        const { rawContent, fileHandle, comments } = get();
        if (!fileHandle) return;
        const comment = comments.find((c) => c.id === id);
        if (!comment) return;
        const newRaw = applyDelete(rawContent, comment);
        try {
          const writable = await fileHandle.createWritable();
          await writable.write(newRaw);
          await writable.close();
          set({
            rawContent: newRaw,
            writeAllowed: true,
            undoState: { rawContent },
          });
        } catch (e) {
          if (
            e instanceof Error &&
            (e.name === "NotAllowedError" || e.name === "SecurityError")
          ) {
            set({ writeAllowed: false });
          }
        }
      },

      editComment: async (id, type, text) => {
        const { rawContent, fileHandle, comments } = get();
        if (!fileHandle) return;
        const comment = comments.find((c) => c.id === id);
        if (!comment) return;
        const newRaw = applyEdit(rawContent, comment, type, text);
        try {
          const writable = await fileHandle.createWritable();
          await writable.write(newRaw);
          await writable.close();
          set({
            rawContent: newRaw,
            writeAllowed: true,
            undoState: { rawContent },
          });
        } catch (e) {
          if (
            e instanceof Error &&
            (e.name === "NotAllowedError" || e.name === "SecurityError")
          ) {
            set({ writeAllowed: false });
          }
        }
      },

      addComment: async (blockIndex, type, text) => {
        const { rawContent, fileHandle, comments } = get();
        if (!fileHandle) return;
        const { cleanMarkdown } = parseCriticMarkup(rawContent);
        const newRaw = insertCommentService(
          rawContent,
          comments,
          cleanMarkdown,
          blockIndex,
          type,
          text,
        );
        try {
          const writable = await fileHandle.createWritable();
          await writable.write(newRaw);
          await writable.close();
          set({
            rawContent: newRaw,
            writeAllowed: true,
            undoState: { rawContent },
          });
        } catch (e) {
          if (
            e instanceof Error &&
            (e.name === "NotAllowedError" || e.name === "SecurityError")
          ) {
            set({ writeAllowed: false });
          }
        }
      },

      undo: async () => {
        const { undoState, fileHandle } = get();
        if (!undoState || !fileHandle) return;
        try {
          const writable = await fileHandle.createWritable();
          await writable.write(undoState.rawContent);
          await writable.close();
          set({
            rawContent: undoState.rawContent,
            undoState: null,
            writeAllowed: true,
          });
        } catch (e) {
          if (
            e instanceof Error &&
            (e.name === "NotAllowedError" || e.name === "SecurityError")
          ) {
            set({ writeAllowed: false });
          }
        }
      },

      clearUndo: () => set({ undoState: null }),
      showToast: (msg) => set({ toast: msg }),
      dismissToast: () => set({ toast: null }),

      refreshFile: async () => {
        const { fileHandle, comments } = get();
        if (!fileHandle) return;
        try {
          const newRaw = await readFile(fileHandle);
          const newlyResolved = comments.filter((c) => !newRaw.includes(c.raw));
          set({ rawContent: newRaw, resolvedComments: newlyResolved });
        } catch {
          // file read failed — silent
        }
      },

      refreshFileTree: async () => {
        const { directoryHandle } = get();
        if (!directoryHandle) return;
        try {
          const tree = await buildFileTree(directoryHandle);
          set({ fileTree: tree });
          get().scanAllFileComments();
        } catch {
          // directory read failed — silent
        }
      },

      restoreDirectory: async () => {
        try {
          const handle =
            await getHandle<FileSystemDirectoryHandle>("directory");
          if (!handle) return;
          const perm = await handle.queryPermission({ mode: "read" });
          if (perm !== "granted") return;
          const tree = await buildFileTree(handle);
          set({
            directoryHandle: handle,
            directoryName: handle.name,
            fileTree: tree,
            sidebarOpen: true,
          });
          get().scanAllFileComments();
          get().restoreRealtimeSessions();
        } catch {
          // IndexedDB unavailable (private browsing, test env) — silent fail
        }
      },

      restoreRealtimeSessions: async () => {
        const { shares } = get();
        const now = new Date();
        const restoredKeys: Record<string, CryptoKey> = {};

        for (const share of shares) {
          if (new Date(share.expiresAt) <= now) continue;
          try {
            const key = await base64urlToKey(share.keyB64);
            restoredKeys[share.docId] = key;
          } catch {
            // skip shares with invalid keys
          }
        }

        if (Object.keys(restoredKeys).length > 0) {
          set({ shareKeys: { ...get().shareKeys, ...restoredKeys } });
        }

        for (const share of shares) {
          if (new Date(share.expiresAt) <= now) continue;
          if (!restoredKeys[share.docId]) continue;
          try {
            get().connectRealtime(share.docId, share.roomPassword);
          } catch {
            // silent — connection may fail in some environments
          }
        }
      },

      // ── v2 Sharing actions ───────────────────────────────────────────────

      shareContent: async ({ ttl, nodes, label: scopeLabel }) => {
        const storage = getStorage();
        if (!storage) throw new Error("Worker URL not configured");
        const {
          fileName,
          directoryName,
          rawContent,
          fileTree,
          activeFilePath,
        } = get();
        const label = scopeLabel ?? directoryName ?? fileName ?? "document";

        // Build tree: either the single open file or all files in memory
        const tree: Record<string, string> = {};
        const sourceNodes =
          nodes ?? (directoryName && fileTree.length > 0 ? fileTree : null);
        if (sourceNodes) {
          // Read all markdown files from the specified nodes
          const readNode = async (items: FileTreeNode[]) => {
            for (const node of items) {
              if (node.kind === "file") {
                const path = node.path;
                // Use in-memory rawContent for the currently open file (always available),
                // and try reading other files from their handles
                if (path === activeFilePath && rawContent) {
                  tree[path] = rawContent;
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
        // Fallback: if no files were read (handles expired) or single-file mode, use rawContent
        if (Object.keys(tree).length === 0 && rawContent) {
          const path = activeFilePath ?? fileName ?? "document.md";
          tree[path] = rawContent;
        }

        const key = await generateKey();
        const { docId, hostSecret } = await storage.uploadContent(tree, key, {
          ttl,
          label,
        });
        const keyB64 = await keyToBase64url(key);

        const roomPwd = generateRoomPassword();
        const now = new Date();
        const record: ShareRecord = {
          docId,
          hostSecret,
          label,
          createdAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
          pendingCommentCount: 0,
          keyB64,
          roomPassword: roomPwd,
          fileCount: Object.keys(tree).length,
          sharedPaths: Object.keys(tree),
        };
        const shares = [...get().shares, record];
        saveShares(shares);
        set({ shares, shareKeys: { ...get().shareKeys, [docId]: key } });
        const roomId = docIdToRoomId(docId);

        // Auto-connect host to the realtime room
        get().connectRealtime(docId, roomPwd);

        const base = window.location.origin + window.location.pathname;
        return `${base}#share=${docId}&key=${keyB64}&room=${roomId}&pwd=${roomPwd}`;
      },

      revokeShare: async (docId) => {
        const storage = getStorage();
        const { shares } = get();
        const record = shares.find((s) => s.docId === docId);
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
        const updated = shares.filter((s) => s.docId !== docId);
        saveShares(updated);
        const { pendingComments, shareKeys } = get();
        const pc = { ...pendingComments };
        delete pc[docId];
        const sk = { ...shareKeys };
        delete sk[docId];
        set({ shares: updated, pendingComments: pc, shareKeys: sk });
      },

      updateShare: async (docId) => {
        const storage = getStorage();
        if (!storage) throw new Error("Worker URL not configured");
        const {
          shares,
          shareKeys,
          rtSession,
          fileName,
          rawContent,
          fileTree,
          activeFilePath,
        } = get();
        const record = shares.find((s) => s.docId === docId);
        if (!record) throw new Error("Share not found");
        const key = shareKeys[docId];
        if (!key)
          throw new Error(
            "Encryption key not available (session may have expired)",
          );

        // Build content tree scoped to the originally shared paths
        const allowed = record.sharedPaths ? new Set(record.sharedPaths) : null;
        const tree: Record<string, string> = {};
        if (fileTree.length > 0) {
          const readNode = async (items: FileTreeNode[]) => {
            for (const node of items) {
              if (node.kind === "file") {
                const path = node.path;
                if (allowed && !allowed.has(path)) continue;
                if (path === activeFilePath && rawContent) {
                  tree[path] = rawContent;
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
          await readNode(fileTree);
        }
        if (Object.keys(tree).length === 0 && rawContent) {
          const fallbackPath = activeFilePath ?? fileName ?? "document.md";
          if (!allowed || allowed.has(fallbackPath)) {
            tree[fallbackPath] = rawContent;
          }
        }

        // Overwrite content at the same docId with the same key
        await storage.updateContent(docId, record.hostSecret, tree, key);

        // Notify connected peers that content was updated
        if (rtSession) rtSession.notifyContentUpdated();
      },

      fetchPendingComments: async (docId) => {
        const storage = getStorage();
        if (!storage) return;
        let key = get().shareKeys[docId];
        if (!key) {
          // Try to recover from shares list — not possible without the base64 key
          // The key is only stored in-memory during the session; if lost, can't decrypt
          return;
        }
        const comments = await storage.fetchComments(docId, key);
        const pc = { ...get().pendingComments, [docId]: comments };
        const shares = get().shares.map((s) =>
          s.docId === docId
            ? { ...s, pendingCommentCount: comments.length }
            : s,
        );
        saveShares(shares);
        set({ pendingComments: pc, shares });
      },

      mergeComment: async (docId, comment) => {
        const { rawContent, fileHandle, comments, activeFilePath, fileName } =
          get();
        if (!fileHandle) return;
        // Find the right file — use rawContent if it's the right path
        const currentPath = activeFilePath ?? fileName ?? "";
        if (comment.path !== currentPath) return; // only merge into the currently open file

        const { cleanMarkdown } = parseCriticMarkup(rawContent);
        const attribution = ` — ${comment.peerName}`;
        const newRaw = insertCommentService(
          rawContent,
          comments,
          cleanMarkdown,
          comment.blockRef.blockIndex,
          comment.commentType,
          comment.text + attribution,
        );
        try {
          const writable = await fileHandle.createWritable();
          await writable.write(newRaw);
          await writable.close();
          set({
            rawContent: newRaw,
            writeAllowed: true,
            undoState: { rawContent },
          });
        } catch (e) {
          if (
            e instanceof Error &&
            (e.name === "NotAllowedError" || e.name === "SecurityError")
          ) {
            set({ writeAllowed: false });
          }
        }
        // Remove from pending
        get().dismissComment(docId, comment.id);
      },

      dismissComment: (docId, cmtId) => {
        const pc = { ...get().pendingComments };
        pc[docId] = (pc[docId] ?? []).filter((c) => c.id !== cmtId);
        const shares = get().shares.map((s) =>
          s.docId === docId
            ? { ...s, pendingCommentCount: pc[docId].length }
            : s,
        );
        saveShares(shares);
        set({ pendingComments: pc, shares });
      },

      clearPendingComments: async (docId) => {
        const storage = getStorage();
        const record = get().shares.find((s) => s.docId === docId);
        if (record && storage) {
          try {
            await storage.deleteComments(docId, record.hostSecret);
          } catch {
            /* ignore */
          }
        }
        const pc = { ...get().pendingComments };
        delete pc[docId];
        const shares = get().shares.map((s) =>
          s.docId === docId ? { ...s, pendingCommentCount: 0 } : s,
        );
        saveShares(shares);
        set({ pendingComments: pc, shares });
      },

      toggleSharedPanel: () =>
        set((s) => ({
          sharedPanelOpen: !s.sharedPanelOpen,
          commentPanelOpen: !s.sharedPanelOpen ? false : s.commentPanelOpen,
        })),

      // ── v2 Peer actions ──────────────────────────────────────────────────

      setPeerName: (name) => set({ peerName: name }),

      selectPeerFile: (path) => {
        const { sharedContent } = get();
        if (!sharedContent) return;
        const content = sharedContent.tree[path];
        if (content === undefined) return;
        set({
          rawContent: content,
          fileName: path,
          activeFilePath: path,
          resolvedComments: [],
        });
      },

      loadSharedContent: async () => {
        const hash = window.location.hash.slice(1);
        const params = new URLSearchParams(hash);
        const docId = params.get("share");
        const keyB64 = params.get("key");
        if (!docId || !keyB64) return;
        const storage = getStorage();
        if (!storage) return;
        try {
          const key = await base64urlToKey(keyB64);
          const payload = await storage.fetchContent(docId, key);
          const firstPath = Object.keys(payload.tree)[0];
          set({
            isPeerMode: true,
            sharedContent: payload,
            shareKeys: { ...get().shareKeys, [docId]: key },
            rawContent: firstPath ? payload.tree[firstPath] : "",
            fileName: firstPath ?? null,
            activeFilePath: firstPath ?? null,
          });
          // Auto-connect to realtime room if room params present
          const roomId = params.get("room");
          const roomPwd = params.get("pwd");
          if (roomId && roomPwd) {
            // Defer connect until peerName is set (handled by connectRealtime)
            set({ rtDocId: docId });
          }
        } catch (e) {
          set({ isPeerMode: true, sharedContent: null });
          console.error("[share] Failed to load shared content:", e);
        }
      },

      postPeerComment: async (blockIndex, type, text, path) => {
        const hash = window.location.hash.slice(1);
        const params = new URLSearchParams(hash);
        const docId = params.get("share");
        const keyB64 = params.get("key");
        if (!docId || !keyB64) return;
        const { peerName, rtSession } = get();
        const comment: PeerComment = {
          id: `c_${crypto.randomUUID()}`,
          peerName: peerName ?? "Anonymous",
          path,
          blockRef: { blockIndex, contentPreview: "" },
          commentType: type,
          text,
          createdAt: new Date().toISOString(),
        };

        // Track locally so peer can see their own comments
        set({ myPeerComments: [comment, ...get().myPeerComments] });

        // Send via WebRTC if connected
        if (rtSession) {
          rtSession.addComment(comment);
        }

        // Always also send to Worker as async backup
        const storage = getStorage();
        if (storage) {
          const key = get().shareKeys[docId] ?? (await base64urlToKey(keyB64));
          await storage.postComment(docId, comment, key);
        }
      },

      // ── Auto-sync ─────────────────────────────────────────────────────

      syncActiveShares: async () => {
        const { shares, isPeerMode } = get();
        if (isPeerMode) return;
        const now = new Date();
        const active = shares.filter((s) => new Date(s.expiresAt) > now);
        for (const share of active) {
          try {
            await get().updateShare(share.docId);
          } catch (e) {
            console.warn("[sync] failed to push update for", share.docId, e);
          }
        }
      },

      // ── v3 Real-time actions ────────────────────────────────────────────

      connectRealtime: (docId, roomPassword) => {
        const { rtSession: existing, peerName } = get();
        if (existing) existing.disconnect();

        const session = new RealtimeSession(
          docIdToRoomId(docId),
          roomPassword,
          peerName ?? "Anonymous",
          {
            onConnectionChange: (status, peers) => {
              set({ rtStatus: status, rtPeers: peers });
            },
            onRemoteComment: (comment) => {
              // Dedup: check if we already have this comment from the Worker
              const { pendingComments } = get();
              const docComments = Object.values(pendingComments).flat();
              if (docComments.some((c) => c.id === comment.id)) return;
              // Add to pending comments under the active docId
              const activeDocId = get().rtDocId;
              if (!activeDocId) return;
              const pc = { ...get().pendingComments };
              pc[activeDocId] = [...(pc[activeDocId] ?? []), comment];
              const shares = get().shares.map((s) =>
                s.docId === activeDocId
                  ? { ...s, pendingCommentCount: pc[activeDocId].length }
                  : s,
              );
              saveShares(shares);
              set({ pendingComments: pc, shares });
              get().showToast(`New comment from ${comment.peerName}`);
            },
            onCommentRemoved: (commentId) => {
              const activeDocId = get().rtDocId;
              if (!activeDocId) return;
              get().dismissComment(activeDocId, commentId);
            },
            onDocumentUpdated: () => {
              set({ contentUpdateAvailable: true });
              get().showToast("Document has been updated by the host");
            },
          },
        );

        set({ rtSession: session, rtDocId: docId, rtStatus: "connecting" });
        session.connect();
      },

      disconnectRealtime: () => {
        const { rtSession } = get();
        if (rtSession) rtSession.disconnect();
        set({
          rtSession: null,
          rtDocId: null,
          rtStatus: "disconnected",
          rtPeers: [],
        });
      },

      setRealtimeAwareness: (activeFile, focusedBlock) => {
        const { rtSession } = get();
        if (rtSession) rtSession.setLocalAwareness(activeFile, focusedBlock);
      },

      dismissContentUpdate: () => set({ contentUpdateAvailable: false }),
    }),
    {
      name: "markreview-store",
      partialize: (s) => ({
        fileName: s.fileName,
        rawContent: s.rawContent,
        theme: s.theme,
        sidebarOpen: s.sidebarOpen,
        activeFilePath: s.activeFilePath,
        directoryName: s.directoryName,
        peerName: s.peerName,
      }),
    },
  ),
);

// ── Debounced auto-push: sync active shares when rawContent changes ──
let _syncTimer: ReturnType<typeof setTimeout> | null = null;
let _prevRawContent = useAppStore.getState().rawContent;
useAppStore.subscribe((state) => {
  const cur = state.rawContent;
  if (cur === _prevRawContent) return;
  _prevRawContent = cur;
  if (state.isPeerMode) return;
  const now = new Date();
  const hasActive = state.shares.some((s) => new Date(s.expiresAt) > now);
  if (!hasActive) return;
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => {
    _syncTimer = null;
    useAppStore.getState().syncActiveShares();
  }, 2000);
});
