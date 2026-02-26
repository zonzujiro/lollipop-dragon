import type { FileTreeNode, FileNode, DirectoryNode, SidebarTreeNode, SidebarDirectoryNode } from '../types/fileTree'

export interface OpenedFile {
  handle: FileSystemFileHandle
  name: string
}

export async function openFile(): Promise<OpenedFile | null> {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [
        {
          description: 'Markdown files',
          accept: { 'text/markdown': ['.md', '.markdown'] },
        },
      ],
      multiple: false,
    })
    return { handle, name: handle.name }
  } catch (err) {
    // User cancelled the picker — not an error
    if (err instanceof DOMException && err.name === 'AbortError') return null
    throw err
  }
}

export async function readFile(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile()
  return file.text()
}

export async function writeFile(
  handle: FileSystemFileHandle,
  content: string,
): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(content)
  await writable.close()
}

// ── Folder support ────────────────────────────────────────────

const IGNORE = new Set(['node_modules', '.git', '.markreview'])
const MD_EXT = new Set(['.md', '.markdown'])

function isIgnored(name: string): boolean {
  return name.startsWith('.') || IGNORE.has(name)
}

function isMdFile(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return dot !== -1 && MD_EXT.has(name.slice(dot))
}

export async function buildFileTree(
  dirHandle: FileSystemDirectoryHandle,
  basePath = '',
): Promise<FileTreeNode[]> {
  const dirs: DirectoryNode[] = []
  const files: FileNode[] = []

  for await (const entry of dirHandle.values()) {
    if (isIgnored(entry.name)) continue
    const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name

    if (entry.kind === 'directory') {
      const children = await buildFileTree(
        entry as FileSystemDirectoryHandle,
        entryPath,
      )
      if (children.length > 0) {
        dirs.push({ kind: 'directory', name: entry.name, path: entryPath, children })
      }
    } else if (isMdFile(entry.name)) {
      files.push({
        kind: 'file',
        name: entry.name,
        path: entryPath,
        handle: entry as FileSystemFileHandle,
      })
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name))
  files.sort((a, b) => a.name.localeCompare(b.name))

  return [...dirs, ...files]
}

/** Build a nested tree from flat path keys like "folder/sub/file.md" */
export function buildVirtualTree(paths: string[]): SidebarTreeNode[] {
  const root: SidebarDirectoryNode = { kind: 'directory', name: '', path: '', children: [] }

  for (const path of paths) {
    const parts = path.split('/')
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const subPath = parts.slice(0, i + 1).join('/')
      if (i === parts.length - 1) {
        current.children.push({ kind: 'file', name, path })
      } else {
        let dir = current.children.find(
          (c) => c.kind === 'directory' && c.name === name,
        ) as SidebarDirectoryNode | undefined
        if (!dir) {
          dir = { kind: 'directory', name, path: subPath, children: [] }
          current.children.push(dir)
        }
        current = dir
      }
    }
  }

  function sortNodes(nodes: SidebarTreeNode[]): SidebarTreeNode[] {
    return nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    }).map((n) => {
      if (n.kind === 'directory') return { ...n, children: sortNodes(n.children) }
      return n
    })
  }

  return sortNodes(root.children)
}

export async function openDirectory(): Promise<{
  handle: FileSystemDirectoryHandle
  name: string
} | null> {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    return { handle, name: handle.name }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null
    throw err
  }
}
