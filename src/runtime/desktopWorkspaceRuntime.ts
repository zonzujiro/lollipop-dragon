import type { DirectoryNode, FileTreeNode } from "../types/fileTree";
import {
  openTauriDirectory,
  openTauriTextFile,
  readTauriDirectoryTree,
  readTauriTextFile,
  type TauriNativeTreeNode,
  writeTauriTextFile,
} from "./tauriBridge";
import type { WorkspaceRuntime } from "./workspace";
import {
  isNativeWorkspaceDirectoryTarget,
  isNativeWorkspaceFileTarget,
} from "./workspace";

function nativeTreeNodeToFileTreeNode(
  node: TauriNativeTreeNode,
  rootPath: string,
): FileTreeNode {
  if (node.kind === "file") {
    return {
      kind: "file",
      name: node.name,
      path: node.path,
      handle: {
        kind: "native_file",
        name: node.name,
        path: `${rootPath}/${node.path}`,
      },
    };
  }

  const directoryNode: DirectoryNode = {
    kind: "directory",
    name: node.name,
    path: node.path,
    children: node.children.map((child) =>
      nativeTreeNodeToFileTreeNode(child, rootPath),
    ),
  };
  return directoryNode;
}

export const desktopWorkspaceRuntime: WorkspaceRuntime = {
  requiresBrowserFileSystemAccess: false,
  openFile: async () => {
    const target = await openTauriTextFile();
    if (!target) {
      return null;
    }

    return {
      handle: target,
      name: target.name,
    };
  },
  openDirectory: async () => {
    const target = await openTauriDirectory();
    if (!target) {
      return null;
    }

    return {
      handle: target,
      name: target.name,
    };
  },
  readFile: (target) => {
    if (!isNativeWorkspaceFileTarget(target)) {
      return Promise.reject(
        new Error(
          "Browser file handles are unavailable in the desktop runtime",
        ),
      );
    }

    return readTauriTextFile(target);
  },
  writeFile: (target, content) => {
    if (!isNativeWorkspaceFileTarget(target)) {
      return Promise.reject(
        new Error(
          "Browser file handles are unavailable in the desktop runtime",
        ),
      );
    }

    return writeTauriTextFile(target, content).then(() => undefined);
  },
  buildFileTree: async (target) => {
    if (!isNativeWorkspaceDirectoryTarget(target)) {
      return Promise.reject(
        new Error(
          "Browser directory handles are unavailable in the desktop runtime",
        ),
      );
    }

    const tree = await readTauriDirectoryTree(target);
    return tree.map((node) => nativeTreeNodeToFileTreeNode(node, target.path));
  },
};
