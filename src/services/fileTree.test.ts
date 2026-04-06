import { describe, expect, it } from 'vitest'
import { buildFileTree } from './fileSystem'
import type { FileNode, DirectoryNode } from '../types/fileTree'

// ── Helpers ────────────────────────────────────────────────────

function makeFileHandle(name: string): FileSystemFileHandle {
  return { kind: 'file', name } as unknown as FileSystemFileHandle
}

function makeDir(
  name: string,
  entries: (FileSystemFileHandle | FileSystemDirectoryHandle)[],
): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    values() {
      let i = 0
      return {
        [Symbol.asyncIterator]() {
          return this
        },
        async next() {
          if (i < entries.length) {
            return { value: entries[i++], done: false as const }
          }
          return { value: undefined as unknown as FileSystemHandle, done: true as const }
        },
      }
    },
  } as unknown as FileSystemDirectoryHandle
}

// ── Tests ──────────────────────────────────────────────────────

describe('buildFileTree', () => {
  it('returns an empty array for an empty directory', async () => {
    const dir = makeDir('root', [])
    expect(await buildFileTree(dir)).toEqual([])
  })

  it('includes .md files', async () => {
    const dir = makeDir('root', [makeFileHandle('notes.md')])
    const tree = await buildFileTree(dir)
    expect(tree).toHaveLength(1)
    expect(tree[0]).toMatchObject({ kind: 'file', name: 'notes.md', path: 'notes.md' })
  })

  it('includes .markdown files', async () => {
    const dir = makeDir('root', [makeFileHandle('readme.markdown')])
    const tree = await buildFileTree(dir)
    expect(tree[0]).toMatchObject({ kind: 'file', name: 'readme.markdown' })
  })

  it('excludes non-markdown files', async () => {
    const dir = makeDir('root', [
      makeFileHandle('script.js'),
      makeFileHandle('image.png'),
      makeFileHandle('data.json'),
    ])
    expect(await buildFileTree(dir)).toHaveLength(0)
  })

  it('excludes node_modules directory', async () => {
    const nm = makeDir('node_modules', [makeFileHandle('readme.md')])
    const dir = makeDir('root', [nm])
    expect(await buildFileTree(dir)).toHaveLength(0)
  })

  it('excludes .git directory', async () => {
    const git = makeDir('.git', [makeFileHandle('config.md')])
    const dir = makeDir('root', [git])
    expect(await buildFileTree(dir)).toHaveLength(0)
  })

  it('excludes .markreview directory', async () => {
    const mr = makeDir('.markreview', [makeFileHandle('settings.md')])
    const dir = makeDir('root', [mr])
    expect(await buildFileTree(dir)).toHaveLength(0)
  })

  it('excludes dotfiles', async () => {
    const dir = makeDir('root', [makeFileHandle('.hidden.md')])
    expect(await buildFileTree(dir)).toHaveLength(0)
  })

  it('excludes directories that contain no md files', async () => {
    const emptyDir = makeDir('assets', [makeFileHandle('logo.png')])
    const dir = makeDir('root', [emptyDir])
    expect(await buildFileTree(dir)).toHaveLength(0)
  })

  it('includes subdirectories that contain md files', async () => {
    const sub = makeDir('docs', [makeFileHandle('guide.md')])
    const dir = makeDir('root', [sub])
    const tree = await buildFileTree(dir)
    expect(tree).toHaveLength(1)
    expect(tree[0]).toMatchObject({ kind: 'directory', name: 'docs' })
    const docDir = tree[0] as DirectoryNode
    expect(docDir.children).toHaveLength(1)
    expect(docDir.children[0]).toMatchObject({ kind: 'file', name: 'guide.md', path: 'docs/guide.md' })
  })

  it('puts directories before files', async () => {
    const sub = makeDir('docs', [makeFileHandle('guide.md')])
    const dir = makeDir('root', [makeFileHandle('readme.md'), sub])
    const tree = await buildFileTree(dir)
    expect(tree[0].kind).toBe('directory')
    expect(tree[1].kind).toBe('file')
  })

  it('sorts directories alphabetically', async () => {
    const z = makeDir('zebra', [makeFileHandle('a.md')])
    const a = makeDir('alpha', [makeFileHandle('b.md')])
    const dir = makeDir('root', [z, a])
    const tree = await buildFileTree(dir)
    const dirs = tree.filter((n) => n.kind === 'directory')
    expect(dirs[0].name).toBe('alpha')
    expect(dirs[1].name).toBe('zebra')
  })

  it('sorts files alphabetically', async () => {
    const dir = makeDir('root', [
      makeFileHandle('zebra.md'),
      makeFileHandle('alpha.md'),
      makeFileHandle('mango.md'),
    ])
    const tree = await buildFileTree(dir)
    const files = tree.filter((n): n is FileNode => n.kind === 'file')
    expect(files.map((f) => f.name)).toEqual(['alpha.md', 'mango.md', 'zebra.md'])
  })

  it('builds paths relative to the root', async () => {
    const nested = makeDir('nested', [makeFileHandle('deep.md')])
    const sub = makeDir('sub', [nested])
    const dir = makeDir('root', [sub])
    const tree = await buildFileTree(dir)
    const subDir = tree[0] as DirectoryNode
    const nestedDir = subDir.children[0] as DirectoryNode
    const file = nestedDir.children[0] as FileNode
    expect(file.path).toBe('sub/nested/deep.md')
  })
})
