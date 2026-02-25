import { useEffect } from 'react'
import { useAppStore } from './store'
import { FilePicker } from './components/FilePicker'
import { Header } from './components/Header'
import { MarkdownRenderer } from './components/MarkdownRenderer'
import { FileTreeSidebar } from './components/FileTreeSidebar'
import { CommentPanel } from './components/CommentPanel'
import { UndoToast } from './components/UndoToast'

function NoFileSelected() {
  return (
    <div className="content-empty">
      <p className="content-empty__text">Select a file from the sidebar to start reading</p>
    </div>
  )
}

function App() {
  const fileName = useAppStore((s) => s.fileName)
  const directoryName = useAppStore((s) => s.directoryName)
  const fileTree = useAppStore((s) => s.fileTree)
  const theme = useAppStore((s) => s.theme)
  const focusMode = useAppStore((s) => s.focusMode)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const commentPanelOpen = useAppStore((s) => s.commentPanelOpen)
  const restoreDirectory = useAppStore((s) => s.restoreDirectory)
  const fileHandle = useAppStore((s) => s.fileHandle)
  const refreshFile = useAppStore((s) => s.refreshFile)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Watch the open file for external changes (e.g. LLM edits) using FileSystemObserver
  useEffect(() => {
    if (!fileHandle || !('FileSystemObserver' in window)) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const observer = new (window as any).FileSystemObserver((records: any[]) => {
      if (records.some((r) => r.type === 'modified' || r.type === 'appeared')) {
        refreshFile()
      }
    })
    ;(async () => {
      try {
        await observer.observe(fileHandle)
      } catch {
        // observation not supported for this handle
      }
    })()
    return () => observer.disconnect()
  }, [fileHandle, refreshFile])

  // Try to rebuild the file tree from the stored directory handle on mount
  useEffect(() => {
    restoreDirectory()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cmd+B / Ctrl+B toggles sidebar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleSidebar])

  const hasFolderOpen = fileTree.length > 0
  // directoryName is persisted — use it to avoid flashing the FilePicker
  // while restoreDirectory is rebuilding the tree in the background.
  const hasContent = !!fileName || !!directoryName

  if (!hasContent) {
    return <FilePicker />
  }

  return (
    <div className="app-layout">
      {!focusMode && <Header />}
      <div className="app-body">
        {hasFolderOpen && sidebarOpen && !focusMode && <FileTreeSidebar />}
        <main className="app-main">
          {fileName ? <MarkdownRenderer /> : <NoFileSelected />}
        </main>
        {commentPanelOpen && !focusMode && <CommentPanel />}
      </div>
      <UndoToast />
      {focusMode && (
        <button
          onClick={toggleFocusMode}
          aria-label="Exit focus mode"
          title="Exit focus mode"
          className="focus-exit-btn"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
            <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
          </svg>
        </button>
      )}
    </div>
  )
}

export default App
