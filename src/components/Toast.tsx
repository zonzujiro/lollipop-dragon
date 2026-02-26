import { useEffect } from 'react'
import { useAppStore } from '../store'

const TOAST_DURATION_MS = 3000

export function Toast() {
  const toast = useAppStore((s) => s.toast)
  const dismissToast = useAppStore((s) => s.dismissToast)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(dismissToast, TOAST_DURATION_MS)
    return () => clearTimeout(timer)
  }, [toast, dismissToast])

  if (!toast) return null

  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="toast__message">{toast}</span>
      <button
        className="toast__dismiss"
        onClick={dismissToast}
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  )
}
