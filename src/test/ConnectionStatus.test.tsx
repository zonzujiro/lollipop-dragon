import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { ConnectionStatus } from '../components/ConnectionStatus'
import { useAppStore } from '../store'

beforeEach(() => {
  useAppStore.setState({
    rtStatus: 'disconnected',
    rtPeers: [],
  })
})

describe('ConnectionStatus', () => {
  it('renders nothing when disconnected', () => {
    const { container } = render(<ConnectionStatus />)
    expect(container.innerHTML).toBe('')
  })

  it('shows "Connecting..." when connecting', () => {
    useAppStore.setState({ rtStatus: 'connecting' })
    render(<ConnectionStatus />)
    expect(screen.getByText('Connecting...')).toBeInTheDocument()
  })

  it('shows peer count when connected with 1 peer', () => {
    useAppStore.setState({
      rtStatus: 'connected',
      rtPeers: [{ peerId: 'p1', name: 'Alice', activeFile: null, focusedBlock: null }],
    })
    render(<ConnectionStatus />)
    expect(screen.getByText('Connected to 1 peer')).toBeInTheDocument()
  })

  it('shows plural peer count when connected with multiple peers', () => {
    useAppStore.setState({
      rtStatus: 'connected',
      rtPeers: [
        { peerId: 'p1', name: 'Alice', activeFile: null, focusedBlock: null },
        { peerId: 'p2', name: 'Bob', activeFile: null, focusedBlock: null },
      ],
    })
    render(<ConnectionStatus />)
    expect(screen.getByText('Connected to 2 peers')).toBeInTheDocument()
  })
})
