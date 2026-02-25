export interface FileNode {
  kind: 'file'
  name: string
  path: string
  handle: FileSystemFileHandle
}

export interface DirectoryNode {
  kind: 'directory'
  name: string
  path: string
  children: FileTreeNode[]
}

export type FileTreeNode = FileNode | DirectoryNode
