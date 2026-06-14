import { activeRuntime } from "./runtime.active";
import type {
  WorkspaceDirectoryTarget,
  WorkspaceFileTarget,
} from "./workspace";

export type {
  AgentCliDetection,
  AgentCommandTestResult,
  AgentConfig,
  AgentConfigSource,
  AgentRuntime,
  AgentRuntimeCapability,
  AgentRunRequest,
  AgentRuntimeRunStatus,
} from "./agent";
export {
  clearDesktopAgentConfig,
  detectDesktopAgentClis,
  getDesktopAgentConfig,
  saveDesktopAgentConfig,
  testDesktopAgentCommand,
} from "./desktopAgentRuntime";
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

export function getAgentRuntimeCapability() {
  return agentRuntime.getCapability();
}

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
