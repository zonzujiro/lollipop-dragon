import { create } from 'zustand'
import { openFile, readFile } from '../services/fileSystem'

interface AppState {
  // File
  fileHandle: FileSystemFileHandle | null
  fileName: string | null
  rawContent: string

  // Actions
  openFile: () => Promise<void>
  clearFile: () => void
}

export const useAppStore = create<AppState>((set) => ({
  fileHandle: null,
  fileName: null,
  rawContent: '',

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
}))
