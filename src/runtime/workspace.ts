import type {
  DirectoryTarget,
  FileTarget,
  FileTreeNode,
  NativeDirectoryTarget,
  NativeFileTarget,
} from "../types/fileTree";
import { isNativeDirectoryTarget, isNativeFileTarget } from "../types/fileTree";

export type NativeWorkspaceFileTarget = NativeFileTarget;
export type NativeWorkspaceDirectoryTarget = NativeDirectoryTarget;
export type WorkspaceFileTarget = FileTarget;
export type WorkspaceDirectoryTarget = DirectoryTarget;

export interface OpenedWorkspaceFile {
  handle: WorkspaceFileTarget;
  name: string;
}

export interface OpenedWorkspaceDirectory {
  handle: WorkspaceDirectoryTarget;
  name: string;
}

export interface WorkspaceRuntime {
  openFile(): Promise<OpenedWorkspaceFile | null>;
  openDirectory(): Promise<OpenedWorkspaceDirectory | null>;
  readFile(target: WorkspaceFileTarget): Promise<string>;
  writeFile(target: WorkspaceFileTarget, content: string): Promise<void>;
  buildFileTree(
    target: WorkspaceDirectoryTarget,
    basePath?: string,
  ): Promise<FileTreeNode[]>;
}

export function isNativeWorkspaceFileTarget(
  target: WorkspaceFileTarget,
): target is NativeWorkspaceFileTarget {
  return isNativeFileTarget(target);
}

export function isNativeWorkspaceDirectoryTarget(
  target: WorkspaceDirectoryTarget,
): target is NativeWorkspaceDirectoryTarget {
  return isNativeDirectoryTarget(target);
}
