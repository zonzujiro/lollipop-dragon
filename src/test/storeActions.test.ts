import { beforeEach, describe, it, expect, vi } from 'vitest'
import { useAppStore } from '../store'
import { getActiveTab } from '../store/selectors'
import { setTestState, resetTestStore } from './testHelpers'
import type { Comment } from '../types/criticmarkup'

function makeHandle(writeOk = true) {
  const mockWritable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) }
  const createWritable = writeOk
    ? vi.fn().mockResolvedValue(mockWritable)
    : vi.fn().mockRejectedValue(Object.assign(new Error(), { name: 'NotAllowedError' }))
  return { handle: { createWritable } as unknown as FileSystemFileHandle, mockWritable }
}

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: '0', criticType: 'comment', type: 'note', text: 'original',
    raw: '{>>original<<}', rawStart: 0, rawEnd: 15,
    cleanStart: 0, cleanEnd: 0,
    ...overrides,
  }
}

beforeEach(() => {
  resetTestStore()
  setTestState({
    fileHandle: null, rawContent: '', comments: [],
    writeAllowed: true, undoState: null, resolvedComments: [],
  })
  vi.restoreAllMocks()
})

describe('store.editComment', () => {
  it('writes updated markup and saves undoState', async () => {
    const { handle, mockWritable } = makeHandle()
    const comment = makeComment({ rawStart: 0, rawEnd: 15 })
    setTestState({
      fileHandle: handle,
      rawContent: '{>>original<<}',
      comments: [comment],
    })
    await useAppStore.getState().editComment('0', 'fix', 'fix this')
    expect(mockWritable.write).toHaveBeenCalledWith('{>>fix: fix this<<}')
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.rawContent).toBe('{>>fix: fix this<<}')
    expect(tab?.undoState?.rawContent).toBe('{>>original<<}')
  })

  it('sets writeAllowed=false on permission error', async () => {
    const { handle } = makeHandle(false)
    setTestState({ fileHandle: handle, rawContent: 'Hi.', comments: [makeComment()] })
    await useAppStore.getState().editComment('0', 'note', 'x')
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.writeAllowed).toBe(false)
  })
})

describe('store.deleteComment', () => {
  it('removes comment markup, writes file, saves undoState', async () => {
    const { handle, mockWritable } = makeHandle()
    const comment = makeComment({ rawStart: 5, rawEnd: 19, raw: '{>>original<<}' })
    const raw = 'Hello{>>original<<}World'
    setTestState({ fileHandle: handle, rawContent: raw, comments: [comment] })
    await useAppStore.getState().deleteComment('0')
    expect(mockWritable.write).toHaveBeenCalledWith('HelloWorld')
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.rawContent).toBe('HelloWorld')
    expect(tab?.undoState?.rawContent).toBe(raw)
  })
})

describe('store.undo', () => {
  it('restores rawContent from undoState and clears it', async () => {
    const { handle, mockWritable } = makeHandle()
    setTestState({
      fileHandle: handle,
      rawContent: 'new content',
      undoState: { rawContent: 'original content' },
    })
    await useAppStore.getState().undo()
    expect(mockWritable.write).toHaveBeenCalledWith('original content')
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.rawContent).toBe('original content')
    expect(tab?.undoState).toBeNull()
  })

  it('does nothing when undoState is null', async () => {
    const { handle, mockWritable } = makeHandle()
    setTestState({ fileHandle: handle, undoState: null })
    await useAppStore.getState().undo()
    expect(mockWritable.write).not.toHaveBeenCalled()
  })
})

describe('store.clearUndo', () => {
  it('clears undoState', () => {
    setTestState({ undoState: { rawContent: 'x' } })
    useAppStore.getState().clearUndo()
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.undoState).toBeNull()
  })
})

describe('store.refreshFile', () => {
  it('reads file from disk and detects resolved comments', async () => {
    const existing = makeComment({ raw: '{>>original<<}', rawStart: 0, rawEnd: 15 })
    // Patch readFile by putting text directly — mock the file read
    setTestState({
      fileHandle: {
        getFile: vi.fn().mockResolvedValue({
          text: vi.fn().mockResolvedValue('New content without the comment.'),
        }),
      } as unknown as FileSystemFileHandle,
      rawContent: '{>>original<<}',
      comments: [existing],
    })
    await useAppStore.getState().refreshFile()
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.rawContent).toBe('New content without the comment.')
    expect(tab?.resolvedComments).toHaveLength(1)
    expect(tab?.resolvedComments[0].raw).toBe('{>>original<<}')
  })

  it('keeps comment as non-resolved if still present in new content', async () => {
    const existing = makeComment({ raw: '{>>original<<}', rawStart: 0, rawEnd: 15 })
    setTestState({
      fileHandle: {
        getFile: vi.fn().mockResolvedValue({
          text: vi.fn().mockResolvedValue('{>>original<<} still here.'),
        }),
      } as unknown as FileSystemFileHandle,
      rawContent: '{>>original<<}',
      comments: [existing],
    })
    await useAppStore.getState().refreshFile()
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.resolvedComments).toHaveLength(0)
  })
})
