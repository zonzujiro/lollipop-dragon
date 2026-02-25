import { beforeEach, describe, it, expect, vi } from 'vitest'
import { useAppStore } from '../store'

function resetStore() {
  useAppStore.setState({
    fileHandle: null,
    rawContent: '',
    comments: [],
    writeAllowed: true,
  })
}

beforeEach(() => {
  resetStore()
  vi.restoreAllMocks()
})

describe('store.addComment', () => {
  it('inserts the comment and updates rawContent', async () => {
    const mockWritable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) }
    const mockHandle = { createWritable: vi.fn().mockResolvedValue(mockWritable) }
    useAppStore.setState({
      fileHandle: mockHandle as unknown as FileSystemFileHandle,
      rawContent: 'First paragraph.\n\nSecond paragraph.',
    })

    await useAppStore.getState().addComment(0, 'note', 'my note')

    const expected = 'First paragraph.{>>my note<<}\n\nSecond paragraph.'
    expect(mockWritable.write).toHaveBeenCalledWith(expected)
    expect(useAppStore.getState().rawContent).toBe(expected)
  })

  it('adds a typed comment with its prefix', async () => {
    const mockWritable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) }
    const mockHandle = { createWritable: vi.fn().mockResolvedValue(mockWritable) }
    useAppStore.setState({
      fileHandle: mockHandle as unknown as FileSystemFileHandle,
      rawContent: 'Para.',
    })

    await useAppStore.getState().addComment(0, 'fix', 'fix it')

    expect(mockWritable.write).toHaveBeenCalledWith('Para.{>>fix: fix it<<}')
    expect(useAppStore.getState().rawContent).toBe('Para.{>>fix: fix it<<}')
  })

  it('sets writeAllowed to false on NotAllowedError', async () => {
    const err = Object.assign(new Error('no permission'), { name: 'NotAllowedError' })
    const mockHandle = { createWritable: vi.fn().mockRejectedValue(err) }
    useAppStore.setState({
      fileHandle: mockHandle as unknown as FileSystemFileHandle,
      rawContent: 'Hello.',
    })

    await useAppStore.getState().addComment(0, 'note', 'hi')

    expect(useAppStore.getState().writeAllowed).toBe(false)
    // rawContent must remain unchanged on error
    expect(useAppStore.getState().rawContent).toBe('Hello.')
  })

  it('sets writeAllowed to false on SecurityError', async () => {
    const err = Object.assign(new Error('security'), { name: 'SecurityError' })
    const mockHandle = { createWritable: vi.fn().mockRejectedValue(err) }
    useAppStore.setState({
      fileHandle: mockHandle as unknown as FileSystemFileHandle,
      rawContent: 'Hello.',
    })

    await useAppStore.getState().addComment(0, 'note', 'hi')

    expect(useAppStore.getState().writeAllowed).toBe(false)
  })

  it('does nothing when fileHandle is null', async () => {
    useAppStore.setState({ fileHandle: null, rawContent: 'Hello.' })
    await useAppStore.getState().addComment(0, 'note', 'hi')
    expect(useAppStore.getState().rawContent).toBe('Hello.')
  })
})
