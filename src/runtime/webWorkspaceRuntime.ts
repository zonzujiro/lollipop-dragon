import {
  buildFileTree,
  openDirectory,
  openFile,
  readFile,
  writeFile,
} from "../services/fileSystem";
import type {
  WorkspaceDirectoryTarget,
  WorkspaceFileTarget,
  WorkspaceRuntime,
} from "./workspace";
import {
  isNativeWorkspaceDirectoryTarget,
  isNativeWorkspaceFileTarget,
} from "./workspace";

function requireBrowserFileHandle(
  target: WorkspaceFileTarget,
): FileSystemFileHandle {
  if (isNativeWorkspaceFileTarget(target)) {
    throw new Error("Native file targets are unavailable in the web runtime");
  }

  return target;
}

function requireBrowserDirectoryHandle(
  target: WorkspaceDirectoryTarget,
): FileSystemDirectoryHandle {
  if (isNativeWorkspaceDirectoryTarget(target)) {
    throw new Error(
      "Native directory targets are unavailable in the web runtime",
    );
  }

  return target;
}

export const webWorkspaceRuntime: WorkspaceRuntime = {
  openFile,
  openDirectory,
  readFile: async (target) => readFile(requireBrowserFileHandle(target)),
  writeFile: async (target, content) =>
    writeFile(requireBrowserFileHandle(target), content),
  buildFileTree: async (target, basePath) =>
    buildFileTree(requireBrowserDirectoryHandle(target), basePath),
};
