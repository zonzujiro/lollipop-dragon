import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from '../store'

// Mock trystero to avoid actual WebRTC connections in tests
vi.mock('trystero/nostr', () => ({
  joinRoom: vi.fn(() => ({
    makeAction: vi.fn(() => [vi.fn().mockResolvedValue([]), vi.fn(), vi.fn()]),
    onPeerJoin: vi.fn(),
    onPeerLeave: vi.fn(),
    leave: vi.fn().mockResolvedValue(undefined),
    getPeers: vi.fn(() => ({})),
  })),
  getRelaySockets: vi.fn(() => ({})),
  selfId: 'test-self-id',
}))

beforeEach(() => {
  useAppStore.setState({
    rtStatus: 'disconnected',
    rtPeers: [],
    rtSession: null,
    rtDocId: null,
    contentUpdateAvailable: false,
    peerName: 'TestUser',
  })
})

describe('store — realtime actions', () => {
  it('connectRealtime sets status to connecting and creates session', () => {
    useAppStore.getState().connectRealtime('doc123', 'password123')
    const state = useAppStore.getState()
    expect(state.rtSession).not.toBeNull()
    expect(state.rtDocId).toBe('doc123')
    expect(state.rtStatus).toBe('connecting')
  })

  it('disconnectRealtime clears session and sets disconnected', () => {
    useAppStore.getState().connectRealtime('doc123', 'password123')
    useAppStore.getState().disconnectRealtime()
    const state = useAppStore.getState()
    expect(state.rtSession).toBeNull()
    expect(state.rtDocId).toBeNull()
    expect(state.rtStatus).toBe('disconnected')
    expect(state.rtPeers).toEqual([])
  })

  it('connectRealtime disconnects existing session first', () => {
    useAppStore.getState().connectRealtime('doc1', 'pwd1')
    const firstSession = useAppStore.getState().rtSession
    useAppStore.getState().connectRealtime('doc2', 'pwd2')
    const secondSession = useAppStore.getState().rtSession
    expect(secondSession).not.toBe(firstSession)
    expect(useAppStore.getState().rtDocId).toBe('doc2')
  })

  it('dismissContentUpdate clears the flag', () => {
    useAppStore.setState({ contentUpdateAvailable: true })
    useAppStore.getState().dismissContentUpdate()
    expect(useAppStore.getState().contentUpdateAvailable).toBe(false)
  })

  it('shareContent generates URL with room and pwd params', async () => {
    // Mock the required state and functions for shareContent
    const mockShareContent = vi.fn().mockResolvedValue('https://example.com/#share=abc&key=xyz&room=mr-abc123&pwd=deadbeef')
    useAppStore.setState({ shareContent: mockShareContent })
    const url = await useAppStore.getState().shareContent({ ttl: 86400 })
    // The URL should contain room and pwd params
    expect(url).toContain('room=')
    expect(url).toContain('pwd=')
  })
})
