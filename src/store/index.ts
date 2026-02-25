import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  openFile as fsOpenFile,
  openDirectory as fsOpenDirectory,
  readFile,
  buildFileTree,
} from '../services/fileSystem'
import { saveHandle, getHandle, removeHandle } from '../services/handleStore'
import type { FileTreeNode, FileNode } from '../types/fileTree'

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

  // UI
  theme: 'light' | 'dark'
  focusMode: boolean

  // Actions
  openFile: () => Promise<void>
  openDirectory: () => Promise<void>
  selectFile: (node: FileNode) => Promise<void>
  clearFile: () => void
  toggleSidebar: () => void
  setTheme: (theme: 'light' | 'dark') => void
  toggleFocusMode: () => void
  restoreDirectory: () => Promise<void>
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      fileHandle: null,
      fileName: null,
      rawContent: '',
      directoryHandle: null,
      directoryName: null,
      fileTree: [],
      activeFilePath: null,
      sidebarOpen: true,
      theme: 'light',
      focusMode: false,

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

      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setTheme: (theme) => set({ theme }),
      toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),

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
