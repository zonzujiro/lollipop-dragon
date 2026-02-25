import { useEffect } from 'react'
import { useAppStore } from '../store'

const TOAST_DURATION_MS = 5000

export function UndoToast() {
  const undoState = useAppStore((s) => s.undoState)
  const undo = useAppStore((s) => s.undo)
  const clearUndo = useAppStore((s) => s.clearUndo)

  useEffect(() => {
    if (!undoState) return
    const timer = setTimeout(clearUndo, TOAST_DURATION_MS)
    return () => clearTimeout(timer)
  }, [undoState, clearUndo])

  if (!undoState) return null

  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span className="undo-toast__message">Change saved.</span>
      <button className="undo-toast__btn" onClick={undo}>
        Undo
      </button>
      <button
        className="undo-toast__dismiss"
        onClick={clearUndo}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
