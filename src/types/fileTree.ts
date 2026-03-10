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
      if (node.path === path) {
        return node;
      }
    } else {
      const found = findFileInTree(node.children, path);
      if (found) {
        return found;
      }
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

/** Type guard: checks whether a SidebarTreeNode is actually a FileTreeNode (has handle on file nodes). */
function isSidebarNodeFileTreeNode(node: SidebarTreeNode): node is FileTreeNode {
  if (node.kind === 'file') {
    return 'handle' in node
  }
  return node.children.every(isSidebarNodeFileTreeNode)
}

/**
 * Narrows SidebarTreeNode[] back to FileTreeNode[] when the nodes
 * originated from a FileTreeNode[] tree (i.e., file nodes have handles).
 * Returns only nodes that pass the type guard.
 */
export function toFileTreeNodes(nodes: SidebarTreeNode[]): FileTreeNode[] {
  return nodes.filter(isSidebarNodeFileTreeNode)
}
