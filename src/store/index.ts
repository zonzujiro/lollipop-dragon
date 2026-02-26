import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  openFile as fsOpenFile,
  openDirectory as fsOpenDirectory,
  readFile,
  buildFileTree,
} from '../services/fileSystem'
import { saveHandle, getHandle, removeHandle } from '../services/handleStore'
import { parseCriticMarkup } from '../services/criticmarkup'
import { insertComment as insertCommentService } from '../services/insertComment'
import { applyEdit } from '../services/editComment'
import { applyDelete } from '../services/deleteComment'
import { ShareStorage } from '../services/shareStorage'
import { generateKey, keyToBase64url, base64urlToKey } from '../services/crypto'
import type { FileTreeNode, FileNode } from '../types/fileTree'
import type { Comment, CommentType } from '../types/criticmarkup'
import type { ShareRecord, SharePayload, PeerComment } from '../types/share'

const WORKER_URL = import.meta.env.VITE_WORKER_URL as string | undefined
const SHARES_KEY = 'markreview-shares'

function loadShares(): ShareRecord[] {
  try { return JSON.parse(localStorage.getItem(SHARES_KEY) ?? '[]') } catch { return [] }
}
function saveShares(shares: ShareRecord[]) {
  localStorage.setItem(SHARES_KEY, JSON.stringify(shares))
}

interface AppState {
  // Single file
  fileHandle: FileSystemFileHandle | null
  fileName: string | null
  rawContent: string

  // Folder
  directoryHandle: FileSystemDirectoryHandle | null
  directoryName: string | null
  fileTree: FileTreeNode[]
  activeFilePath: string | null
  sidebarOpen: boolean

  // Comments (derived from rawContent by MarkdownRenderer)
  comments: Comment[]
  resolvedComments: Comment[]
  activeCommentId: string | null
  commentPanelOpen: boolean
  commentFilter: CommentType | 'all' | 'pending' | 'resolved'

  // UI
  theme: 'light' | 'dark'
  focusMode: boolean
  writeAllowed: boolean
  undoState: { rawContent: string } | null

  // Sharing (v2)
  shares: ShareRecord[]
  sharedPanelOpen: boolean
  isPeerMode: boolean
  peerName: string | null
  sharedContent: SharePayload | null
  // docId → decrypted comments fetched from Worker
  pendingComments: Record<string, PeerComment[]>
  // docId → CryptoKey (in-memory only, not persisted)
  shareKeys: Record<string, CryptoKey>

  // v1 Actions
  openFile: () => Promise<void>
  openDirectory: () => Promise<void>
  selectFile: (node: FileNode) => Promise<void>
  clearFile: () => void
  setComments: (comments: Comment[]) => void
  setActiveCommentId: (id: string | null) => void
  toggleCommentPanel: () => void
  setCommentFilter: (f: CommentType | 'all' | 'pending' | 'resolved') => void
  toggleSidebar: () => void
  setTheme: (theme: 'light' | 'dark') => void
  toggleFocusMode: () => void
  restoreDirectory: () => Promise<void>
  refreshFile: () => Promise<void>
  addComment: (blockIndex: number, type: CommentType, text: string) => Promise<void>
  editComment: (id: string, type: CommentType, text: string) => Promise<void>
  deleteComment: (id: string) => Promise<void>
  undo: () => Promise<void>
  clearUndo: () => void

  // v2 Sharing actions
  shareContent: (opts: { ttl: number }) => Promise<string>
  revokeShare: (docId: string) => Promise<void>
  updateShare: (docId: string) => Promise<void>
  fetchPendingComments: (docId: string) => Promise<void>
  mergeComment: (docId: string, comment: PeerComment) => Promise<void>
  dismissComment: (docId: string, cmtId: string) => void
  clearPendingComments: (docId: string) => Promise<void>
  toggleSharedPanel: () => void

  // v2 Peer actions
  setPeerName: (name: string) => void
  loadSharedContent: () => Promise<void>
  postPeerComment: (blockIndex: number, type: CommentType, text: string, path: string) => Promise<void>
}

function getStorage(): ShareStorage | null {
  return WORKER_URL ? new ShareStorage(WORKER_URL) : null
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      fileHandle: null,
      fileName: null,
      rawContent: '',
      directoryHandle: null,
      directoryName: null,
      fileTree: [],
      activeFilePath: null,
      sidebarOpen: true,
      comments: [],
      resolvedComments: [],
      activeCommentId: null,
      commentPanelOpen: false,
      commentFilter: 'all',
      theme: 'light',
      focusMode: false,
      writeAllowed: true,
      undoState: null,
      shares: loadShares(),
      sharedPanelOpen: false,
      isPeerMode: false,
      peerName: null,
      sharedContent: null,
      pendingComments: {},
      shareKeys: {},

      // ── v1 actions ──────────────────────────────────────────────────────

      openFile: async () => {
        const result = await fsOpenFile()
        if (!result) return
        const raw = await readFile(result.handle)
        await removeHandle('directory')
        set({
          fileHandle: result.handle,
          fileName: result.name,
          rawContent: raw,
          directoryHandle: null,
          directoryName: null,
          fileTree: [],
          activeFilePath: null,
          resolvedComments: [],
        })
      },

      openDirectory: async () => {
        const result = await fsOpenDirectory()
        if (!result) return
        await saveHandle('directory', result.handle)
        set({
          fileHandle: null,
          fileName: null,
          rawContent: '',
          activeFilePath: null,
          directoryHandle: result.handle,
          directoryName: result.name,
          fileTree: [],
          sidebarOpen: true,
        })
        const tree = await buildFileTree(result.handle)
        set({ fileTree: tree })
      },

      selectFile: async (node: FileNode) => {
        const raw = await readFile(node.handle)
        set({
          fileHandle: node.handle,
          fileName: node.name,
          rawContent: raw,
          activeFilePath: node.path,
          resolvedComments: [],
        })
      },

      clearFile: () =>
        set({
          fileHandle: null,
          fileName: null,
          rawContent: '',
          directoryHandle: null,
          directoryName: null,
          fileTree: [],
          activeFilePath: null,
        }),

      setComments: (comments) => set({ comments, activeCommentId: null, commentFilter: 'all' }),
      setActiveCommentId: (id) => set({ activeCommentId: id }),
      toggleCommentPanel: () => set((s) => ({
        commentPanelOpen: !s.commentPanelOpen,
        sharedPanelOpen: !s.commentPanelOpen ? false : s.sharedPanelOpen,
      })),
      setCommentFilter: (f) => set({ commentFilter: f, activeCommentId: null }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setTheme: (theme) => set({ theme }),
      toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),

      deleteComment: async (id) => {
        const { rawContent, fileHandle, comments } = get()
        if (!fileHandle) return
        const comment = comments.find((c) => c.id === id)
        if (!comment) return
        const newRaw = applyDelete(rawContent, comment)
        try {
          const writable = await fileHandle.createWritable()
          await writable.write(newRaw)
          await writable.close()
          set({ rawContent: newRaw, writeAllowed: true, undoState: { rawContent } })
        } catch (e) {
          if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
            set({ writeAllowed: false })
          }
        }
      },

      editComment: async (id, type, text) => {
        const { rawContent, fileHandle, comments } = get()
        if (!fileHandle) return
        const comment = comments.find((c) => c.id === id)
        if (!comment) return
        const newRaw = applyEdit(rawContent, comment, type, text)
        try {
          const writable = await fileHandle.createWritable()
          await writable.write(newRaw)
          await writable.close()
          set({ rawContent: newRaw, writeAllowed: true, undoState: { rawContent } })
        } catch (e) {
          if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
            set({ writeAllowed: false })
          }
        }
      },

      addComment: async (blockIndex, type, text) => {
        const { rawContent, fileHandle, comments } = get()
        if (!fileHandle) return
        const { cleanMarkdown } = parseCriticMarkup(rawContent)
        const newRaw = insertCommentService(rawContent, comments, cleanMarkdown, blockIndex, type, text)
        try {
          const writable = await fileHandle.createWritable()
          await writable.write(newRaw)
          await writable.close()
          set({ rawContent: newRaw, writeAllowed: true, undoState: { rawContent } })
        } catch (e) {
          if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
            set({ writeAllowed: false })
          }
        }
      },

      undo: async () => {
        const { undoState, fileHandle } = get()
        if (!undoState || !fileHandle) return
        try {
          const writable = await fileHandle.createWritable()
          await writable.write(undoState.rawContent)
          await writable.close()
          set({ rawContent: undoState.rawContent, undoState: null, writeAllowed: true })
        } catch (e) {
          if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
            set({ writeAllowed: false })
          }
        }
      },

      clearUndo: () => set({ undoState: null }),

      refreshFile: async () => {
        const { fileHandle, comments } = get()
        if (!fileHandle) return
        try {
          const newRaw = await readFile(fileHandle)
          const newlyResolved = comments.filter((c) => !newRaw.includes(c.raw))
          set({ rawContent: newRaw, resolvedComments: newlyResolved })
        } catch {
          // file read failed — silent
        }
      },

      restoreDirectory: async () => {
        try {
          const handle = await getHandle<FileSystemDirectoryHandle>('directory')
          if (!handle) return
          const perm = await handle.queryPermission({ mode: 'read' })
          if (perm !== 'granted') return
          const tree = await buildFileTree(handle)
          set({
            directoryHandle: handle,
            directoryName: handle.name,
            fileTree: tree,
            sidebarOpen: true,
          })
        } catch {
          // IndexedDB unavailable (private browsing, test env) — silent fail
        }
      },

      // ── v2 Sharing actions ───────────────────────────────────────────────

      shareContent: async ({ ttl }) => {
        const storage = getStorage()
        if (!storage) throw new Error('Worker URL not configured')
        const { fileName, directoryName, rawContent, fileTree, activeFilePath } = get()
        const label = directoryName ?? fileName ?? 'document'

        // Build tree: either the single open file or all files in memory
        let tree: Record<string, string>
        if (directoryName && fileTree.length > 0) {
          // Read all markdown files from the folder
          tree = {}
          const readNode = async (nodes: FileTreeNode[]) => {
            for (const node of nodes) {
              if (node.type === 'file') {
                try { tree[node.path] = await readFile((node as FileNode).handle) } catch { /* skip */ }
              } else if (node.type === 'directory' && 'children' in node) {
                await readNode((node as { children: FileTreeNode[] }).children)
              }
            }
          }
          await readNode(fileTree)
        } else {
          const path = activeFilePath ?? fileName ?? 'document.md'
          tree = { [path]: rawContent }
        }

        const key = await generateKey()
        const { docId, hostSecret } = await storage.uploadContent(tree, key, { ttl, label })
        const keyB64 = await keyToBase64url(key)

        const now = new Date()
        const record: ShareRecord = {
          docId,
          hostSecret,
          label,
          createdAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
          pendingCommentCount: 0,
        }
        const shares = [...get().shares, record]
        saveShares(shares)
        set({ shares, shareKeys: { ...get().shareKeys, [docId]: key } })

        const base = window.location.origin + window.location.pathname
        return `${base}#share=${docId}&key=${keyB64}`
      },

      revokeShare: async (docId) => {
        const storage = getStorage()
        const { shares } = get()
        const record = shares.find((s) => s.docId === docId)
        if (!record) return
        try { await storage?.deleteContent(docId, record.hostSecret) } catch { /* ignore if already gone */ }
        try { await storage?.deleteComments(docId, record.hostSecret) } catch { /* ignore */ }
        const updated = shares.filter((s) => s.docId !== docId)
        saveShares(updated)
        const { pendingComments, shareKeys } = get()
        const pc = { ...pendingComments }; delete pc[docId]
        const sk = { ...shareKeys }; delete sk[docId]
        set({ shares: updated, pendingComments: pc, shareKeys: sk })
      },

      updateShare: async (docId) => {
        const storage = getStorage()
        if (!storage) throw new Error('Worker URL not configured')
        const { shares } = get()
        const record = shares.find((s) => s.docId === docId)
        if (!record) throw new Error('Share not found')

        // Revoke old share silently
        try { await storage.deleteContent(docId, record.hostSecret) } catch { /* ignore */ }

        // Re-share with a new key/docId using same TTL
        const ttl = Math.round((new Date(record.expiresAt).getTime() - Date.now()) / 1000)
        const url = await get().shareContent({ ttl: Math.max(ttl, 3600) })
        return url
      },

      fetchPendingComments: async (docId) => {
        const storage = getStorage()
        if (!storage) return
        let key = get().shareKeys[docId]
        if (!key) {
          // Try to recover from shares list — not possible without the base64 key
          // The key is only stored in-memory during the session; if lost, can't decrypt
          return
        }
        const comments = await storage.fetchComments(docId, key)
        const pc = { ...get().pendingComments, [docId]: comments }
        const shares = get().shares.map((s) =>
          s.docId === docId ? { ...s, pendingCommentCount: comments.length } : s,
        )
        saveShares(shares)
        set({ pendingComments: pc, shares })
      },

      mergeComment: async (docId, comment) => {
        const { rawContent, fileHandle, comments, activeFilePath, fileName } = get()
        if (!fileHandle) return
        // Find the right file — use rawContent if it's the right path
        const currentPath = activeFilePath ?? fileName ?? ''
        if (comment.path !== currentPath) return  // only merge into the currently open file

        const { cleanMarkdown } = parseCriticMarkup(rawContent)
        const attribution = ` — ${comment.peerName}`
        const newRaw = insertCommentService(
          rawContent,
          comments,
          cleanMarkdown,
          comment.blockRef.blockIndex,
          comment.commentType,
          comment.text + attribution,
        )
        try {
          const writable = await fileHandle.createWritable()
          await writable.write(newRaw)
          await writable.close()
          set({ rawContent: newRaw, writeAllowed: true, undoState: { rawContent } })
        } catch (e) {
          if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
            set({ writeAllowed: false })
          }
        }
        // Remove from pending
        get().dismissComment(docId, comment.id)
      },

      dismissComment: (docId, cmtId) => {
        const pc = { ...get().pendingComments }
        pc[docId] = (pc[docId] ?? []).filter((c) => c.id !== cmtId)
        const shares = get().shares.map((s) =>
          s.docId === docId ? { ...s, pendingCommentCount: pc[docId].length } : s,
        )
        saveShares(shares)
        set({ pendingComments: pc, shares })
      },

      clearPendingComments: async (docId) => {
        const storage = getStorage()
        const record = get().shares.find((s) => s.docId === docId)
        if (record && storage) {
          try { await storage.deleteComments(docId, record.hostSecret) } catch { /* ignore */ }
        }
        const pc = { ...get().pendingComments }
        delete pc[docId]
        const shares = get().shares.map((s) =>
          s.docId === docId ? { ...s, pendingCommentCount: 0 } : s,
        )
        saveShares(shares)
        set({ pendingComments: pc, shares })
      },

      toggleSharedPanel: () => set((s) => ({
        sharedPanelOpen: !s.sharedPanelOpen,
        commentPanelOpen: !s.sharedPanelOpen ? false : s.commentPanelOpen,
      })),

      // ── v2 Peer actions ──────────────────────────────────────────────────

      setPeerName: (name) => set({ peerName: name }),

      loadSharedContent: async () => {
        const hash = window.location.hash.slice(1)
        const params = new URLSearchParams(hash)
        const docId = params.get('share')
        const keyB64 = params.get('key')
        if (!docId || !keyB64) return
        const storage = getStorage()
        if (!storage) return
        try {
          const key = await base64urlToKey(keyB64)
          const payload = await storage.fetchContent(docId, key)
          const firstPath = Object.keys(payload.tree)[0]
          set({
            isPeerMode: true,
            sharedContent: payload,
            shareKeys: { ...get().shareKeys, [docId]: key },
            rawContent: firstPath ? payload.tree[firstPath] : '',
            fileName: firstPath ?? null,
          })
        } catch (e) {
          set({ isPeerMode: true, sharedContent: null })
          console.error('Failed to load shared content:', e)
        }
      },

      postPeerComment: async (blockIndex, type, text, path) => {
        const hash = window.location.hash.slice(1)
        const params = new URLSearchParams(hash)
        const docId = params.get('share')
        const keyB64 = params.get('key')
        if (!docId || !keyB64) return
        const storage = getStorage()
        if (!storage) return
        const { peerName } = get()
        const key = get().shareKeys[docId] ?? await base64urlToKey(keyB64)
        const comment: PeerComment = {
          id: `c_${crypto.randomUUID()}`,
          peerName: peerName ?? 'Anonymous',
          path,
          blockRef: { blockIndex, contentPreview: '' },
          commentType: type,
          text,
          createdAt: new Date().toISOString(),
        }
        await storage.postComment(docId, comment, key)
      },
    }),
    {
      name: 'markreview-store',
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
)
