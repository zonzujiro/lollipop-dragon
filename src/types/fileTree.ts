export interface FileNode {
  kind: "file";
  name: string;
  path: string;
  handle: FileSystemFileHandle;
}

export interface DirectoryNode {
  kind: "directory";
  name: string;
  path: string;
  children: FileTreeNode[];
}

export type FileTreeNode = FileNode | DirectoryNode;

// Sidebar-specific types (no handle field) for the unified presentational sidebar
export interface SidebarFileNode {
  kind: "file";
  name: string;
  path: string;
}

export interface SidebarDirectoryNode {
  kind: "directory";
  name: string;
  path: string;
  children: SidebarTreeNode[];
}

export type SidebarTreeNode = SidebarFileNode | SidebarDirectoryNode;

export interface HydratedSidebarFileNode extends SidebarFileNode {
  handle?: FileSystemFileHandle;
}

export interface HydratedSidebarDirectoryNode {
  kind: "directory";
  name: string;
  path: string;
  children: HydratedSidebarTreeNode[];
}

export type HydratedSidebarTreeNode =
  | HydratedSidebarFileNode
  | HydratedSidebarDirectoryNode;

/** Type guard: checks whether a hydrated sidebar node is actually a live file tree node. */
function isSidebarNodeFileTreeNode(
  node: HydratedSidebarTreeNode,
): node is FileTreeNode {
  if (node.kind === "file") {
    return "handle" in node;
  }
  return node.children.every(isSidebarNodeFileTreeNode);
}

export function findLiveFileInTree(
  nodes: HydratedSidebarTreeNode[],
  path: string,
): FileNode | null {
  for (const node of nodes) {
    if (node.kind === "file") {
      if (node.path === path && "handle" in node) {
        return node;
      }
    } else {
      const found = findLiveFileInTree(node.children, path);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function toPersistedTree(
  nodes: HydratedSidebarTreeNode[],
): SidebarTreeNode[] {
  return nodes.map((node) => {
    if (node.kind === "file") {
      return {
        kind: "file",
        name: node.name,
        path: node.path,
      };
    }
    return {
      kind: "directory",
      name: node.name,
      path: node.path,
      children: toPersistedTree(node.children),
    };
  });
}

export function toFileTreeNodes(
  nodes: HydratedSidebarTreeNode[],
): FileTreeNode[] {
  const liveNodes: FileTreeNode[] = [];
  for (const node of nodes) {
    if (!isSidebarNodeFileTreeNode(node)) {
      continue;
    }
    liveNodes.push(node);
  }
  return liveNodes;
}
