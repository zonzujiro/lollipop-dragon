export interface NativeFileTarget {
  kind: "native_file";
  path: string;
  name: string;
}

export interface NativeDirectoryTarget {
  kind: "native_directory";
  path: string;
  name: string;
}

export type FileTarget = FileSystemFileHandle | NativeFileTarget;

export type DirectoryTarget = FileSystemDirectoryHandle | NativeDirectoryTarget;

export function isNativeFileTarget(
  target: FileTarget,
): target is NativeFileTarget {
  return target.kind === "native_file";
}

export function isNativeDirectoryTarget(
  target: DirectoryTarget,
): target is NativeDirectoryTarget {
  return target.kind === "native_directory";
}

export function isBrowserFileHandle(
  target: FileTarget | DirectoryTarget,
): target is FileSystemFileHandle {
  return target.kind === "file";
}

export function isBrowserDirectoryHandle(
  target: FileTarget | DirectoryTarget,
): target is FileSystemDirectoryHandle {
  return target.kind === "directory";
}

export interface FileNode {
  kind: "file";
  name: string;
  path: string;
  handle: FileTarget;
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
  handle?: FileTarget;
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

/** Build a nested sidebar tree from flat path keys like "folder/sub/file.md". */
export function buildVirtualTree(paths: string[]): SidebarTreeNode[] {
  const root: SidebarDirectoryNode = {
    kind: "directory",
    name: "",
    path: "",
    children: [],
  };

  for (const path of paths) {
    const parts = path.split("/");
    let current = root;
    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      const subPath = parts.slice(0, index + 1).join("/");
      if (index === parts.length - 1) {
        current.children.push({ kind: "file", name, path });
      } else {
        const found = current.children.find(
          (child) => child.kind === "directory" && child.name === name,
        );
        let directory: SidebarDirectoryNode | undefined =
          found?.kind === "directory" ? found : undefined;
        if (!directory) {
          directory = {
            kind: "directory",
            name,
            path: subPath,
            children: [],
          };
          current.children.push(directory);
        }
        current = directory;
      }
    }
  }

  return sortSidebarTreeNodes(root.children);
}

function sortSidebarTreeNodes(nodes: SidebarTreeNode[]): SidebarTreeNode[] {
  return nodes
    .sort((leftNode, rightNode) => {
      if (leftNode.kind !== rightNode.kind) {
        return leftNode.kind === "directory" ? -1 : 1;
      }
      return leftNode.name.localeCompare(rightNode.name);
    })
    .map((node) => {
      if (node.kind === "directory") {
        return { ...node, children: sortSidebarTreeNodes(node.children) };
      }
      return node;
    });
}
