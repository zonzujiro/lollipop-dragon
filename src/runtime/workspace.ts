import type { FileTreeNode } from "../types/fileTree";

export interface NativeWorkspaceFileTarget {
  kind: "native_file";
  path: string;
  name: string;
}

export interface NativeWorkspaceDirectoryTarget {
  kind: "native_directory";
  path: string;
  name: string;
}

export type WorkspaceFileTarget =
  | FileSystemFileHandle
  | NativeWorkspaceFileTarget;

export type WorkspaceDirectoryTarget =
  | FileSystemDirectoryHandle
  | NativeWorkspaceDirectoryTarget;

export interface OpenedWorkspaceFile {
  handle: FileSystemFileHandle;
  name: string;
}

export interface OpenedWorkspaceDirectory {
  handle: FileSystemDirectoryHandle;
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
  return target.kind === "native_file";
}

export function isNativeWorkspaceDirectoryTarget(
  target: WorkspaceDirectoryTarget,
): target is NativeWorkspaceDirectoryTarget {
  return target.kind === "native_directory";
}
