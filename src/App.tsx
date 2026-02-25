import { useEffect } from 'react'
import { useAppStore } from './store'
import { FilePicker } from './components/FilePicker'
import { Header } from './components/Header'
import { MarkdownRenderer } from './components/MarkdownRenderer'

function App() {
  const fileHandle = useAppStore((s) => s.fileHandle)
  const theme = useAppStore((s) => s.theme)
  const focusMode = useAppStore((s) => s.focusMode)
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  if (!fileHandle) {
    return <FilePicker />
  }

  return (
    <div className="app-layout">
      {!focusMode && <Header />}
      <main className="app-main">
        <MarkdownRenderer />
      </main>
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
