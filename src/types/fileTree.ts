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

// Sidebar-specific types (no handle field) for the unified presentational sidebar
export interface SidebarFileNode {
  kind: 'file'
  name: string
  path: string
}

export interface SidebarDirectoryNode {
  kind: 'directory'
  name: string
  path: string
  children: SidebarTreeNode[]
}

export type SidebarTreeNode = SidebarFileNode | SidebarDirectoryNode
