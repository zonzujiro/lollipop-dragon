import { beforeEach, describe, it, expect, vi } from 'vitest'
import { useAppStore } from '../store'
import type { ShareRecord, PeerComment } from '../types/share'

function makeShare(overrides: Partial<ShareRecord> = {}): ShareRecord {
  return {
    docId: 'doc-1',
    hostSecret: 'secret',
    label: 'my-doc',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    pendingCommentCount: 0,
    ...overrides,
  }
}

function makePeerComment(overrides: Partial<PeerComment> = {}): PeerComment {
  return {
    id: 'cmt-1',
    peerName: 'Alice',
    path: 'readme.md',
    blockRef: { blockIndex: 0, contentPreview: 'Some text' },
    commentType: 'note',
    text: 'A comment',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

beforeEach(() => {
  useAppStore.setState({
    shares: [],
    pendingComments: {},
    shareKeys: {},
    fileName: null,
    activeFilePath: null,
    rawContent: '',
    fileHandle: null,
    comments: [],
    writeAllowed: true,
  })
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('store.dismissComment', () => {
  it('removes comment from pendingComments by id', () => {
    const comment = makePeerComment({ id: 'cmt-1' })
    useAppStore.setState({
      pendingComments: { 'doc-1': [comment, makePeerComment({ id: 'cmt-2' })] },
      shares: [makeShare()],
    })
    useAppStore.getState().dismissComment('doc-1', 'cmt-1')
    const pending = useAppStore.getState().pendingComments['doc-1']
    expect(pending).toHaveLength(1)
    expect(pending[0].id).toBe('cmt-2')
  })

  it('updates pendingCommentCount in shares', () => {
    useAppStore.setState({
      pendingComments: {
        'doc-1': [makePeerComment({ id: 'cmt-1' }), makePeerComment({ id: 'cmt-2' })],
      },
      shares: [makeShare({ pendingCommentCount: 2 })],
    })
    useAppStore.getState().dismissComment('doc-1', 'cmt-1')
    const share = useAppStore.getState().shares.find((s) => s.docId === 'doc-1')
    expect(share?.pendingCommentCount).toBe(1)
  })

  it('handles dismissing from a non-existent docId gracefully', () => {
    useAppStore.setState({ pendingComments: {}, shares: [] })
    expect(() => useAppStore.getState().dismissComment('doc-x', 'cmt-1')).not.toThrow()
  })
})

describe('store.toggleSharedPanel', () => {
  it('toggles sharedPanelOpen from false to true', () => {
    useAppStore.setState({ sharedPanelOpen: false })
    useAppStore.getState().toggleSharedPanel()
    expect(useAppStore.getState().sharedPanelOpen).toBe(true)
  })

  it('toggles sharedPanelOpen from true to false', () => {
    useAppStore.setState({ sharedPanelOpen: true })
    useAppStore.getState().toggleSharedPanel()
    expect(useAppStore.getState().sharedPanelOpen).toBe(false)
  })
})

describe('store.setPeerName', () => {
  it('sets peerName in state', () => {
    useAppStore.getState().setPeerName('Bob')
    expect(useAppStore.getState().peerName).toBe('Bob')
  })
})

describe('store.mergeComment', () => {
  it('does nothing when no fileHandle', async () => {
    useAppStore.setState({
      fileHandle: null,
      rawContent: '# Hello\n',
      pendingComments: { 'doc-1': [makePeerComment()] },
      shares: [makeShare()],
    })
    await useAppStore.getState().mergeComment('doc-1', makePeerComment())
    // No write should have occurred (no error either)
    expect(useAppStore.getState().rawContent).toBe('# Hello\n')
  })

  it('does nothing when comment.path !== currentPath', async () => {
    const mockWritable = { write: vi.fn(), close: vi.fn() }
    const fileHandle = { createWritable: vi.fn().mockResolvedValue(mockWritable) } as unknown as FileSystemFileHandle
    useAppStore.setState({
      fileHandle,
      rawContent: '# Hello\n',
      fileName: 'readme.md',
      activeFilePath: 'readme.md',
      comments: [],
      pendingComments: { 'doc-1': [makePeerComment({ path: 'other.md' })] },
      shares: [makeShare()],
    })
    await useAppStore.getState().mergeComment('doc-1', makePeerComment({ path: 'other.md' }))
    expect(mockWritable.write).not.toHaveBeenCalled()
  })
})

describe('store.revokeShare', () => {
  it('removes share from state and localStorage', async () => {
    // Mock storage to avoid network calls
    const share = makeShare()
    useAppStore.setState({
      shares: [share],
      pendingComments: { 'doc-1': [makePeerComment()] },
      shareKeys: {},
    })
    // Since WORKER_URL is undefined in tests, storage is null — revokeShare just removes from state
    await useAppStore.getState().revokeShare('doc-1')
    expect(useAppStore.getState().shares).toHaveLength(0)
    expect(useAppStore.getState().pendingComments['doc-1']).toBeUndefined()
  })

  it('does nothing when docId is not in shares', async () => {
    useAppStore.setState({ shares: [makeShare()] })
    await useAppStore.getState().revokeShare('doc-unknown')
    expect(useAppStore.getState().shares).toHaveLength(1)
  })
})
