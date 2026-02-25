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
import type { FileTreeNode, FileNode } from '../types/fileTree'
import type { Comment, CommentType } from '../types/criticmarkup'

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

  // Actions
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
        // Clear file state immediately — before the async buildFileTree — so a
        // refresh during scanning doesn't restore the previously open single file.
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
      toggleCommentPanel: () => set((s) => ({ commentPanelOpen: !s.commentPanelOpen })),
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
      }),
    },
  ),
)
