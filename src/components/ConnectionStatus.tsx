import { useAppStore } from '../store'

export function ConnectionStatus() {
  const status = useAppStore((s) => s.rtStatus)
  const peers = useAppStore((s) => s.rtPeers)

  if (status === 'disconnected') return null

  const color =
    status === 'connected'
      ? 'var(--c-green)'
      : status === 'error'
        ? 'var(--c-red)'
        : 'var(--c-orange)'

  const label =
    status === 'connected'
      ? `Connected to ${peers.length} peer${peers.length !== 1 ? 's' : ''}`
      : status === 'error'
        ? 'Offline'
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
