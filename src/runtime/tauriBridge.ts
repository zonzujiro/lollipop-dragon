import type { AgentRunRequest, AgentRuntimeRunStatus } from "./agent";
import type {
  NativeWorkspaceDirectoryTarget,
  NativeWorkspaceFileTarget,
} from "./workspace";

export type TauriCommand =
  | "dragon_runtime_ping"
  | "dragon_agent_runtime_available"
  | "dragon_open_text_file"
  | "dragon_open_directory"
  | "dragon_read_text_file"
  | "dragon_write_text_file"
  | "dragon_read_directory_tree"
  | "dragon_start_agent_run"
  | "dragon_stop_agent_run"
  | "dragon_get_agent_run_status";

export interface TauriNativeFileNode {
  kind: "file";
  name: string;
  path: string;
}

export interface TauriNativeDirectoryNode {
  kind: "directory";
  name: string;
  path: string;
  children: TauriNativeTreeNode[];
}

export type TauriNativeTreeNode =
  | TauriNativeFileNode
  | TauriNativeDirectoryNode;

interface NativePathTargetPayload {
  path: string;
  name: string;
}

interface TauriCoreApi {
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
}

interface TauriGlobalApi {
  core: TauriCoreApi;
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobalApi;
  }
}

export function hasTauriBridge(): boolean {
  return Boolean(window.__TAURI__?.core);
}

export function invokeTauriCommand(input: {
  command: TauriCommand;
  args?: Record<string, unknown>;
}): Promise<unknown> {
  const core = window.__TAURI__?.core;
  if (!core) {
    return Promise.reject(new Error("Tauri runtime bridge is unavailable"));
  }

  return core.invoke(input.command, input.args);
}

export async function pingTauriRuntime(): Promise<"ok"> {
  const result = await invokeTauriCommand({ command: "dragon_runtime_ping" });
  if (result === "ok") {
    return result;
  }

  throw new Error("Unexpected Tauri runtime ping response");
}

export async function getTauriAgentRuntimeAvailable(): Promise<boolean> {
  const result = await invokeTauriCommand({
    command: "dragon_agent_runtime_available",
  });
  if (typeof result === "boolean") {
    return result;
  }

  throw new Error("Unexpected Tauri agent capability response");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringField(
  record: Record<string, unknown>,
  fieldName: string,
): string {
  const value = record[fieldName];
  if (typeof value === "string") {
    return value;
  }

  throw new Error(`Unexpected native file tree ${fieldName} field`);
}

function readOptionalNumberField(
  record: Record<string, unknown>,
  fieldName: string,
): number | null {
  const value = record[fieldName];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return value;
  }

  throw new Error(`Unexpected native agent run ${fieldName} field`);
}

function parseNativeAgentRunStatus(value: unknown): AgentRuntimeRunStatus {
  if (!isRecord(value)) {
    throw new Error("Unexpected native agent run status response");
  }

  const status = readStringField(value, "status");
  const output = readStringField(value, "output");
  if (status === "running") {
    return { status, output };
  }

  if (status === "completed") {
    return {
      status,
      exitCode: readOptionalNumberField(value, "exitCode"),
      output,
    };
  }

  if (status === "failed") {
    return {
      status,
      exitCode: readOptionalNumberField(value, "exitCode"),
      message: readStringField(value, "message"),
      output,
    };
  }

  if (status === "not_found") {
    return {
      status,
      message: readStringField(value, "message"),
      output,
    };
  }

  throw new Error("Unexpected native agent run status");
}

function parseNativeTreeNode(value: unknown): TauriNativeTreeNode {
  if (!isRecord(value)) {
    throw new Error("Unexpected native file tree node");
  }

  const kind = value.kind;
  const name = readStringField(value, "name");
  const path = readStringField(value, "path");
  if (kind === "file") {
    return { kind, name, path };
  }

  if (kind === "directory") {
    const childrenValue = value.children;
    if (!Array.isArray(childrenValue)) {
      throw new Error("Unexpected native file tree children field");
    }

    return {
      kind,
      name,
      path,
      children: childrenValue.map(parseNativeTreeNode),
    };
  }

  throw new Error("Unexpected native file tree kind");
}

function parseNativeTree(value: unknown): TauriNativeTreeNode[] {
  if (!Array.isArray(value)) {
    throw new Error("Unexpected native file tree response");
  }

  return value.map(parseNativeTreeNode);
}

function parseNativePathTarget(value: unknown): NativePathTargetPayload | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new Error("Unexpected native path target response");
  }

  return {
    path: readStringField(value, "path"),
    name: readStringField(value, "name"),
  };
}

export async function openTauriTextFile(): Promise<NativeWorkspaceFileTarget | null> {
  const result = await invokeTauriCommand({
    command: "dragon_open_text_file",
  });
  const target = parseNativePathTarget(result);
  if (!target) {
    return null;
  }

  return {
    kind: "native_file",
    path: target.path,
    name: target.name,
  };
}

export async function openTauriDirectory(): Promise<NativeWorkspaceDirectoryTarget | null> {
  const result = await invokeTauriCommand({
    command: "dragon_open_directory",
  });
  const target = parseNativePathTarget(result);
  if (!target) {
    return null;
  }

  return {
    kind: "native_directory",
    path: target.path,
    name: target.name,
  };
}

export async function readTauriTextFile(
  target: NativeWorkspaceFileTarget,
): Promise<string> {
  const result = await invokeTauriCommand({
    command: "dragon_read_text_file",
    args: { path: target.path },
  });
  if (typeof result === "string") {
    return result;
  }

  throw new Error("Unexpected native file read response");
}

export function writeTauriTextFile(
  target: NativeWorkspaceFileTarget,
  content: string,
): Promise<unknown> {
  return invokeTauriCommand({
    command: "dragon_write_text_file",
    args: { path: target.path, content },
  });
}

export async function readTauriDirectoryTree(
  target: NativeWorkspaceDirectoryTarget,
): Promise<TauriNativeTreeNode[]> {
  const result = await invokeTauriCommand({
    command: "dragon_read_directory_tree",
    args: { path: target.path },
  });
  return parseNativeTree(result);
}

export async function startTauriAgentRun(
  request: AgentRunRequest,
): Promise<string> {
  const result = await invokeTauriCommand({
    command: "dragon_start_agent_run",
    args: { request },
  });
  if (typeof result === "string") {
    return result;
  }

  throw new Error("Unexpected native agent run response");
}

export function stopTauriAgentRun(runId: string): Promise<unknown> {
  return invokeTauriCommand({
    command: "dragon_stop_agent_run",
    args: { runId },
  });
}

export async function getTauriAgentRunStatus(
  runId: string,
): Promise<AgentRuntimeRunStatus> {
  const result = await invokeTauriCommand({
    command: "dragon_get_agent_run_status",
    args: { runId },
  });
  return parseNativeAgentRunStatus(result);
}
