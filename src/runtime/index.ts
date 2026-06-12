import { webWorkspaceRuntime } from "./webWorkspaceRuntime";

export type {
  OpenedWorkspaceDirectory,
  OpenedWorkspaceFile,
  WorkspaceRuntime,
} from "./workspace";

export const workspaceRuntime = webWorkspaceRuntime;

export function openFile() {
  return workspaceRuntime.openFile();
}

export function openDirectory() {
  return workspaceRuntime.openDirectory();
}

export function readFile(handle: FileSystemFileHandle) {
  return workspaceRuntime.readFile(handle);
}

export function writeFile(handle: FileSystemFileHandle, content: string) {
  return workspaceRuntime.writeFile(handle, content);
}

export function buildFileTree(
  handle: FileSystemDirectoryHandle,
  basePath?: string,
) {
  return workspaceRuntime.buildFileTree(handle, basePath);
}
