import { activeRuntime } from "./runtime.active";
import type {
  WorkspaceDirectoryTarget,
  WorkspaceFileTarget,
} from "./workspace";

export type {
  AgentRuntime,
  AgentRunRequest,
  AgentRuntimeRunStatus,
} from "./agent";
export type { TerminalAttachment, TerminalRuntime } from "./terminal";
export type {
  NativeWorkspaceDirectoryTarget,
  NativeWorkspaceFileTarget,
  OpenedWorkspaceDirectory,
  OpenedWorkspaceFile,
  WorkspaceDirectoryTarget,
  WorkspaceFileTarget,
  WorkspaceRuntime,
} from "./workspace";
export {
  isNativeWorkspaceDirectoryTarget,
  isNativeWorkspaceFileTarget,
} from "./workspace";

export const workspaceRuntime = activeRuntime.workspaceRuntime;
export const agentRuntime = activeRuntime.agentRuntime;
export const terminalRuntime = activeRuntime.terminalRuntime;

export const canRunAgent = agentRuntime.canRunAgent;
export const canShowTerminal = terminalRuntime.canShowTerminal;

export function openFile() {
  return workspaceRuntime.openFile();
}

export function openDirectory() {
  return workspaceRuntime.openDirectory();
}

export function readFile(target: WorkspaceFileTarget) {
  return workspaceRuntime.readFile(target);
}

export function writeFile(target: WorkspaceFileTarget, content: string) {
  return workspaceRuntime.writeFile(target, content);
}

export function buildFileTree(
  target: WorkspaceDirectoryTarget,
  basePath?: string,
) {
  return workspaceRuntime.buildFileTree(target, basePath);
}
