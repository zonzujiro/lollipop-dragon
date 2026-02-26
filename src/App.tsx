import { useEffect, useState } from 'react'
import { useAppStore } from './store'
import { FilePicker } from './components/FilePicker'
import { Header } from './components/Header'
import { MarkdownRenderer } from './components/MarkdownRenderer'
import { FileTreeSidebar } from './components/FileTreeSidebar'
import { CommentPanel } from './components/CommentPanel'
import { SharedPanel } from './components/SharedPanel'
import { UndoToast } from './components/UndoToast'
import { PeerNamePrompt } from './components/PeerNamePrompt'

const WORKER_URL = import.meta.env.VITE_WORKER_URL as string | undefined

function NoFileSelected() {
  return (
    <div className="content-empty">
      <p className="content-empty__text">Select a file from the sidebar to start reading</p>
    </div>
  )
}

function ShareUnavailable() {
  return (
    <div className="share-status">
      <svg className="share-status__icon" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      <h2 className="share-status__title">Document unavailable</h2>
      <p className="share-status__text">
        This shared link has been revoked by the author or has expired.
      </p>
    </div>
  )
}

// Peer mode: render the first file in the shared folder tree
function PeerViewer() {
  const sharedContent = useAppStore((s) => s.sharedContent)
  const rawContent = useAppStore((s) => s.rawContent)

  if (!sharedContent) return <ShareUnavailable />
  if (!rawContent) return <ShareUnavailable />

  return <MarkdownRenderer />
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
  const sharedPanelOpen = useAppStore((s) => s.sharedPanelOpen)
  const restoreDirectory = useAppStore((s) => s.restoreDirectory)
  const fileHandle = useAppStore((s) => s.fileHandle)
  const refreshFile = useAppStore((s) => s.refreshFile)

  // v2 peer mode
  const isPeerMode = useAppStore((s) => s.isPeerMode)
  const peerName = useAppStore((s) => s.peerName)
  const loadSharedContent = useAppStore((s) => s.loadSharedContent)

  const [peerModeChecked, setPeerModeChecked] = useState(false)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Check for peer mode URL on mount and on hash change (same-tab navigation)
  useEffect(() => {
    function checkHash() {
      const hash = window.location.hash
      if (hash.includes('share=') && hash.includes('key=') && WORKER_URL) {
        loadSharedContent().finally(() => setPeerModeChecked(true))
      } else {
        setPeerModeChecked(true)
        restoreDirectory()
      }
    }
    checkHash()
    window.addEventListener('hashchange', checkHash)
    return () => window.removeEventListener('hashchange', checkHash)
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
      try { await observer.observe(fileHandle) } catch { /* unsupported */ }
    })()
    return () => observer.disconnect()
  }, [fileHandle, refreshFile])

  // Peer mode: show name prompt first, then the document
  if (isPeerMode) {
    if (!peerModeChecked) return null  // still loading
    if (!peerName) return <PeerNamePrompt />
    return (
      <div className="app-layout">
        <Header peerMode />
        <div className="app-body">
          <main className="app-main">
            <PeerViewer />
          </main>
        </div>
      </div>
    )
  }

  if (!peerModeChecked) return null

  const hasFolderOpen = fileTree.length > 0
  const hasContent = !!fileName || !!directoryName

  if (!hasContent) return <FilePicker />

  return (
    <div className="app-layout">
      {!focusMode && <Header />}
      <div className="app-body">
        {hasFolderOpen && sidebarOpen && !focusMode && <FileTreeSidebar />}
        <main className="app-main">
          {fileName ? <MarkdownRenderer /> : <NoFileSelected />}
        </main>
        {commentPanelOpen && !focusMode && <CommentPanel />}
        {sharedPanelOpen && !focusMode && <SharedPanel />}
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
