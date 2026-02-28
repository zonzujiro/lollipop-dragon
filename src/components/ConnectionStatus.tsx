import { useEffect, useState } from 'react'
import { useAppStore } from '../store'

const ASYNC_TIMEOUT_MS = 15_000

export function ConnectionStatus() {
  const status = useAppStore((s) => s.rtStatus)
  const peers = useAppStore((s) => s.rtPeers)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    setTimedOut(false)
    if (status !== 'connecting') return
    const id = setTimeout(() => setTimedOut(true), ASYNC_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [status])

  if (status === 'disconnected') return null

  const asyncMode = status === 'error' || (status === 'connecting' && timedOut)

  const color =
    status === 'connected'
      ? 'var(--c-green)'
      : asyncMode
        ? 'var(--text-muted)'
        : 'var(--c-orange)'

  const label =
    status === 'connected'
      ? `Connected to ${peers.length} peer${peers.length !== 1 ? 's' : ''}`
      : asyncMode
        ? 'Async mode'
        : 'Connecting...'

  return (
    <span className="connection-status" title={label}>
      <span
        className="connection-status__dot"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="connection-status__label">{label}</span>
    </span>
  )
}
