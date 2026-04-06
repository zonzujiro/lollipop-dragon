import { beforeEach, describe, it, expect, vi } from 'vitest'
import { useAppStore } from '../store'
import { getActiveTab } from '../store/selectors'
import { setTestState, resetTestStore, makeShare, makePeerComment } from './testHelpers'

beforeEach(() => {
  resetTestStore()
  setTestState({
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
    setTestState({
      pendingComments: { 'doc-1': [comment, makePeerComment({ id: 'cmt-2' })] },
      shares: [makeShare()],
    })
    useAppStore.getState().dismissComment('doc-1', 'cmt-1')
    const tab = getActiveTab(useAppStore.getState())
    const pending = tab?.pendingComments['doc-1']
    expect(pending).toHaveLength(1)
    expect(pending?.[0].id).toBe('cmt-2')
  })

  it('updates pendingCommentCount in shares', () => {
    setTestState({
      pendingComments: {
        'doc-1': [makePeerComment({ id: 'cmt-1' }), makePeerComment({ id: 'cmt-2' })],
      },
      shares: [makeShare({ pendingCommentCount: 2 })],
    })
    useAppStore.getState().dismissComment('doc-1', 'cmt-1')
    const tab = getActiveTab(useAppStore.getState())
    const share = tab?.shares.find((s) => s.docId === 'doc-1')
    expect(share?.pendingCommentCount).toBe(1)
  })

  it('handles dismissing from a non-existent docId gracefully', () => {
    setTestState({ pendingComments: {}, shares: [] })
    expect(() => useAppStore.getState().dismissComment('doc-x', 'cmt-1')).not.toThrow()
  })
})

describe('store.toggleSharedPanel', () => {
  it('toggles sharedPanelOpen from false to true', () => {
    setTestState({ sharedPanelOpen: false })
    useAppStore.getState().toggleSharedPanel()
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.sharedPanelOpen).toBe(true)
  })

  it('toggles sharedPanelOpen from true to false', () => {
    setTestState({ sharedPanelOpen: true })
    useAppStore.getState().toggleSharedPanel()
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.sharedPanelOpen).toBe(false)
  })
})

describe('store.mergeComment', () => {
  it('does nothing when no fileHandle', async () => {
    setTestState({
      fileHandle: null,
      rawContent: '# Hello\n',
      pendingComments: { 'doc-1': [makePeerComment()] },
      shares: [makeShare()],
    })
    await useAppStore.getState().mergeComment('doc-1', makePeerComment())
    // No write should have occurred (no error either)
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.rawContent).toBe('# Hello\n')
  })

  it('does nothing when comment.path !== currentPath', async () => {
    const mockWritable = { write: vi.fn(), close: vi.fn() }
    const fileHandle = { createWritable: vi.fn().mockResolvedValue(mockWritable) } as unknown as FileSystemFileHandle
    setTestState({
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
    setTestState({
      shares: [share],
      pendingComments: { 'doc-1': [makePeerComment()] },
      shareKeys: {},
    })
    // Since WORKER_URL is undefined in tests, storage is null — revokeShare just removes from state
    await useAppStore.getState().revokeShare('doc-1')
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.shares).toHaveLength(0)
    expect(tab?.pendingComments['doc-1']).toBeUndefined()
  })

  it('does nothing when docId is not in shares', async () => {
    setTestState({ shares: [makeShare()] })
    await useAppStore.getState().revokeShare('doc-unknown')
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.shares).toHaveLength(1)
  })
})
