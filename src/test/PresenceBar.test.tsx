import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { PresenceBar } from '../components/PresenceBar'
import { useAppStore } from '../store'

beforeEach(() => {
  useAppStore.setState({
    rtStatus: 'disconnected',
    rtPeers: [],
  })
})

describe('PresenceBar', () => {
  it('renders nothing when disconnected', () => {
    const { container } = render(<PresenceBar />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when connected but no peers', () => {
    useAppStore.setState({ rtStatus: 'connected', rtPeers: [] })
    const { container } = render(<PresenceBar />)
    expect(container.innerHTML).toBe('')
  })

  it('renders peer initials when connected with peers', () => {
    useAppStore.setState({
      rtStatus: 'connected',
      rtPeers: [
        { peerId: 'p1', name: 'Alice Smith', activeFile: 'readme.md', focusedBlock: null },
      ],
    })
    render(<PresenceBar />)
    expect(screen.getByText('AS')).toBeInTheDocument()
  })

  it('shows active file in title attribute', () => {
    useAppStore.setState({
      rtStatus: 'connected',
      rtPeers: [
        { peerId: 'p1', name: 'Bob', activeFile: 'design.md', focusedBlock: null },
      ],
    })
    render(<PresenceBar />)
    const peer = screen.getByText('B')
    expect(peer).toHaveAttribute('title', 'Bob — viewing design.md')
  })

  it('renders multiple peers', () => {
    useAppStore.setState({
      rtStatus: 'connected',
      rtPeers: [
        { peerId: 'p1', name: 'Alice', activeFile: null, focusedBlock: null },
        { peerId: 'p2', name: 'Bob', activeFile: null, focusedBlock: null },
      ],
    })
    render(<PresenceBar />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })
})
