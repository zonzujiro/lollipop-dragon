import type { FileTreeNode } from "../types/fileTree";

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
  readFile(handle: FileSystemFileHandle): Promise<string>;
  writeFile(handle: FileSystemFileHandle, content: string): Promise<void>;
  buildFileTree(
    handle: FileSystemDirectoryHandle,
    basePath?: string,
  ): Promise<FileTreeNode[]>;
}
