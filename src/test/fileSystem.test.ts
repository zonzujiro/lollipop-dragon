import { describe, it, expect, vi, beforeEach } from 'vitest'
import { openFile, readFile, writeFile } from '../services/fileSystem'

function makeMockHandle(name: string, content: string): FileSystemFileHandle {
  return {
    name,
    kind: 'file',
    getFile: vi.fn().mockResolvedValue({
      text: vi.fn().mockResolvedValue(content),
    }),
    createWritable: vi.fn().mockResolvedValue({
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    }),
    isSameEntry: vi.fn(),
    queryPermission: vi.fn(),
    requestPermission: vi.fn(),
  } as unknown as FileSystemFileHandle
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('openFile', () => {
  it('returns handle and name when user picks a file', async () => {
    const mockHandle = makeMockHandle('notes.md', '# Hello')
    vi.stubGlobal('showOpenFilePicker', vi.fn().mockResolvedValue([mockHandle]))

    const result = await openFile()

    expect(result).not.toBeNull()
    expect(result!.name).toBe('notes.md')
    expect(result!.handle).toBe(mockHandle)
  })

  it('returns null when user cancels the picker', async () => {
    vi.stubGlobal(
      'showOpenFilePicker',
      vi.fn().mockRejectedValue(new DOMException('User cancelled', 'AbortError')),
    )

    const result = await openFile()
    expect(result).toBeNull()
  })

  it('re-throws unexpected errors', async () => {
    vi.stubGlobal(
      'showOpenFilePicker',
      vi.fn().mockRejectedValue(new Error('Unexpected failure')),
    )

    await expect(openFile()).rejects.toThrow('Unexpected failure')
  })
})

describe('readFile', () => {
  it('returns file text content', async () => {
    const mockHandle = makeMockHandle('doc.md', '# Title\n\nSome content.')
    const content = await readFile(mockHandle)
    expect(content).toBe('# Title\n\nSome content.')
  })
})

describe('writeFile', () => {
  it('writes content and closes the stream', async () => {
    const writeMock = vi.fn().mockResolvedValue(undefined)
    const closeMock = vi.fn().mockResolvedValue(undefined)
    const mockHandle = {
      name: 'doc.md',
      kind: 'file',
      createWritable: vi.fn().mockResolvedValue({ write: writeMock, close: closeMock }),
    } as unknown as FileSystemFileHandle

    await writeFile(mockHandle, '# Updated')

    expect(writeMock).toHaveBeenCalledWith('# Updated')
    expect(closeMock).toHaveBeenCalled()
  })
})
