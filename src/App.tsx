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

  // Sync dark class on <html> so Tailwind dark: variants and CSS vars apply
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  if (!fileHandle) {
    return <FilePicker />
  }

  return (
    <div className="flex h-screen flex-col">
      {!focusMode && <Header />}
      <main className="flex-1 overflow-hidden">
        <MarkdownRenderer />
      </main>
      {focusMode && (
        <button
          onClick={toggleFocusMode}
          aria-label="Exit focus mode"
          title="Exit focus mode"
          className="fixed right-4 top-4 rounded-full bg-stone-800/60 p-2 text-white opacity-40 transition-opacity hover:opacity-100 dark:bg-stone-200/20"
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
