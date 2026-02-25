import { useAppStore } from '../store'

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
    </svg>
  )
}

function FocusIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
      <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
    </svg>
  )
}

function SidebarIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="18" height="18" x="3" y="3" rx="2"/>
      <path d="M9 3v18"/>
    </svg>
  )
}

export function Header() {
  const fileName = useAppStore((s) => s.fileName)
  const directoryName = useAppStore((s) => s.directoryName)
  const fileTree = useAppStore((s) => s.fileTree)
  const openFile = useAppStore((s) => s.openFile)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const toggleFocusMode = useAppStore((s) => s.toggleFocusMode)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)

  const isDark = theme === 'dark'
  const hasFolderOpen = fileTree.length > 0

  const displayName = hasFolderOpen && fileName
    ? `${directoryName} / ${fileName}`
    : (fileName ?? directoryName ?? '')

  return (
    <header className="app-header">
      <div className="app-header__left">
        {hasFolderOpen && (
          <button
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            title={sidebarOpen ? 'Hide sidebar (⌘B)' : 'Show sidebar (⌘B)'}
            className="app-header__btn app-header__btn--icon"
          >
            <SidebarIcon />
          </button>
        )}
        <span className="app-header__filename">{displayName}</span>
      </div>

      <div className="app-header__actions">
        {!hasFolderOpen && (
          <button onClick={openFile} className="app-header__btn app-header__btn--text">
            Open another file
          </button>
        )}

        <div className="app-header__divider" aria-hidden="true" />

        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="app-header__btn app-header__btn--icon"
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>

        <button
          onClick={toggleFocusMode}
          aria-label="Enter focus mode"
          title="Enter focus mode"
          className="app-header__btn app-header__btn--icon"
        >
          <FocusIcon />
        </button>
      </div>
    </header>
  )
}
