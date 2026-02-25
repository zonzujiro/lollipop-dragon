import { create } from 'zustand'
import { openFile, readFile } from '../services/fileSystem'

interface AppState {
  // File
  fileHandle: FileSystemFileHandle | null
  fileName: string | null
  rawContent: string

  // UI
  theme: 'light' | 'dark'
  focusMode: boolean

  // Actions
  openFile: () => Promise<void>
  clearFile: () => void
  setTheme: (theme: 'light' | 'dark') => void
  toggleFocusMode: () => void
}

export const useAppStore = create<AppState>((set) => ({
  fileHandle: null,
  fileName: null,
  rawContent: '',
  theme: 'light',
  focusMode: false,

  openFile: async () => {
    const result = await openFile()
    if (!result) return
    const raw = await readFile(result.handle)
    set({
      fileHandle: result.handle,
      fileName: result.name,
      rawContent: raw,
    })
  },

  clearFile: () => set({ fileHandle: null, fileName: null, rawContent: '' }),
  setTheme: (theme) => set({ theme }),
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
}))
