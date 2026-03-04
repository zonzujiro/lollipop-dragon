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

export function findFileInTree(
  nodes: FileTreeNode[],
  path: string,
): FileNode | null {
  for (const node of nodes) {
    if (node.kind === "file") {
      if (node.path === path) return node;
    } else {
      const found = findFileInTree(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

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
