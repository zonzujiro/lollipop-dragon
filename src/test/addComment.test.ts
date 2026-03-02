import { beforeEach, describe, it, expect, vi } from 'vitest'
import { useAppStore } from '../store'
import { getActiveTab } from '../store/selectors'
import { setTestState, resetTestStore } from './testHelpers'

beforeEach(() => {
  resetTestStore()
  setTestState({
    fileHandle: null,
    rawContent: '',
    comments: [],
    writeAllowed: true,
  })
  vi.restoreAllMocks()
})

describe('store.addComment', () => {
  it('inserts the comment and updates rawContent', async () => {
    const mockWritable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) }
    const mockHandle = { createWritable: vi.fn().mockResolvedValue(mockWritable) }
    setTestState({
      fileHandle: mockHandle as unknown as FileSystemFileHandle,
      rawContent: 'First paragraph.\n\nSecond paragraph.',
    })

    await useAppStore.getState().addComment(0, 'note', 'my note')

    const expected = 'First paragraph.{>>my note<<}\n\nSecond paragraph.'
    expect(mockWritable.write).toHaveBeenCalledWith(expected)
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.rawContent).toBe(expected)
  })

  it('adds a typed comment with its prefix', async () => {
    const mockWritable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) }
    const mockHandle = { createWritable: vi.fn().mockResolvedValue(mockWritable) }
    setTestState({
      fileHandle: mockHandle as unknown as FileSystemFileHandle,
      rawContent: 'Para.',
    })

    await useAppStore.getState().addComment(0, 'fix', 'fix it')

    expect(mockWritable.write).toHaveBeenCalledWith('Para.{>>fix: fix it<<}')
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.rawContent).toBe('Para.{>>fix: fix it<<}')
  })

  it('sets writeAllowed to false on NotAllowedError', async () => {
    const err = Object.assign(new Error('no permission'), { name: 'NotAllowedError' })
    const mockHandle = { createWritable: vi.fn().mockRejectedValue(err) }
    setTestState({
      fileHandle: mockHandle as unknown as FileSystemFileHandle,
      rawContent: 'Hello.',
    })

    await useAppStore.getState().addComment(0, 'note', 'hi')

    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.writeAllowed).toBe(false)
    // rawContent must remain unchanged on error
    expect(tab?.rawContent).toBe('Hello.')
  })

  it('sets writeAllowed to false on SecurityError', async () => {
    const err = Object.assign(new Error('security'), { name: 'SecurityError' })
    const mockHandle = { createWritable: vi.fn().mockRejectedValue(err) }
    setTestState({
      fileHandle: mockHandle as unknown as FileSystemFileHandle,
      rawContent: 'Hello.',
    })

    await useAppStore.getState().addComment(0, 'note', 'hi')

    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.writeAllowed).toBe(false)
  })

  it('does nothing when fileHandle is null', async () => {
    setTestState({ fileHandle: null, rawContent: 'Hello.' })
    await useAppStore.getState().addComment(0, 'note', 'hi')
    const tab = getActiveTab(useAppStore.getState())
    expect(tab?.rawContent).toBe('Hello.')
  })
})
