import type {
  AgentCliDetection,
  AgentCommandTestResult,
  AgentConfig,
  AgentConfigSource,
  AgentRunRequest,
  AgentRuntimeRunStatus,
} from "./agent";
import type {
  NativeWorkspaceDirectoryTarget,
  NativeWorkspaceFileTarget,
} from "./workspace";

export type TauriCommand =
  | "dragon_runtime_ping"
  | "dragon_agent_runtime_available"
  | "dragon_get_agent_config"
  | "dragon_save_agent_config"
  | "dragon_clear_agent_config"
  | "dragon_detect_agent_clis"
  | "dragon_test_agent_command"
  | "dragon_open_text_file"
  | "dragon_open_directory"
  | "dragon_read_text_file"
  | "dragon_write_text_file"
  | "dragon_read_directory_tree"
  | "dragon_start_path_watch"
  | "dragon_take_path_watch_events"
  | "dragon_stop_path_watch"
  | "dragon_start_agent_run"
  | "dragon_stop_agent_run"
  | "dragon_get_agent_run_status"
  | "dragon_send_agent_run_input"
  | "dragon_send_agent_run_data"
  | "dragon_resize_agent_run_terminal";

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

export async function getTauriAgentConfig(): Promise<AgentConfig> {
  const result = await invokeTauriCommand({
    command: "dragon_get_agent_config",
  });
  return parseNativeAgentConfig(result);
}

export function saveTauriAgentConfig(command: string): Promise<unknown> {
  return invokeTauriCommand({
    command: "dragon_save_agent_config",
    args: { command },
  });
}

export function clearTauriAgentConfig(): Promise<unknown> {
  return invokeTauriCommand({
    command: "dragon_clear_agent_config",
  });
}

export async function detectTauriAgentClis(): Promise<AgentCliDetection[]> {
  const result = await invokeTauriCommand({
    command: "dragon_detect_agent_clis",
  });
  return parseNativeAgentCliDetections(result);
}

export async function testTauriAgentCommand(
  command: string,
): Promise<AgentCommandTestResult> {
  const result = await invokeTauriCommand({
    command: "dragon_test_agent_command",
    args: { command },
  });
  return parseNativeAgentCommandTest(result);
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

function readOptionalStringField(
  record: Record<string, unknown>,
  fieldName: string,
): string | null {
  const value = record[fieldName];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }

  throw new Error(`Unexpected native ${fieldName} field`);
}

function readBooleanField(
  record: Record<string, unknown>,
  fieldName: string,
): boolean {
  const value = record[fieldName];
  if (typeof value === "boolean") {
    return value;
  }

  throw new Error(`Unexpected native ${fieldName} field`);
}

function parseAgentConfigSource(
  value: string | null,
): AgentConfigSource | null {
  if (value === null) {
    return null;
  }
  if (value === "config" || value === "environment") {
    return value;
  }

  throw new Error("Unexpected native agent config source");
}

function parseNativeAgentConfig(value: unknown): AgentConfig {
  if (!isRecord(value)) {
    throw new Error("Unexpected native agent config response");
  }

  return {
    command: readOptionalStringField(value, "command"),
    source: parseAgentConfigSource(readOptionalStringField(value, "source")),
  };
}

function parseNativeAgentCliDetection(value: unknown): AgentCliDetection {
  if (!isRecord(value)) {
    throw new Error("Unexpected native agent CLI detection response");
  }

  return {
    id: readStringField(value, "id"),
    label: readStringField(value, "label"),
    command: readStringField(value, "command"),
    path: readOptionalStringField(value, "path"),
    available: readBooleanField(value, "available"),
    version: readOptionalStringField(value, "version"),
  };
}

function parseNativeAgentCliDetections(value: unknown): AgentCliDetection[] {
  if (!Array.isArray(value)) {
    throw new Error("Unexpected native agent CLI detections response");
  }

  return value.map(parseNativeAgentCliDetection);
}

function parseNativeAgentCommandTest(value: unknown): AgentCommandTestResult {
  if (!isRecord(value)) {
    throw new Error("Unexpected native agent command test response");
  }

  return {
    ok: readBooleanField(value, "ok"),
    message: readStringField(value, "message"),
    output: readStringField(value, "output"),
  };
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

export async function startTauriPathWatch(input: {
  path: string;
  recursive: boolean;
}): Promise<string> {
  const result = await invokeTauriCommand({
    command: "dragon_start_path_watch",
    args: input,
  });
  if (typeof result === "string") {
    return result;
  }

  throw new Error("Unexpected native path watch response");
}

export async function takeTauriPathWatchEvents(
  watchId: string,
): Promise<boolean> {
  const result = await invokeTauriCommand({
    command: "dragon_take_path_watch_events",
    args: { watchId },
  });
  if (typeof result === "boolean") {
    return result;
  }

  throw new Error("Unexpected native path watch event response");
}

export function stopTauriPathWatch(watchId: string): Promise<unknown> {
  return invokeTauriCommand({
    command: "dragon_stop_path_watch",
    args: { watchId },
  });
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

export async function sendTauriAgentRunInput(
  runId: string,
  input: string,
): Promise<void> {
  await invokeTauriCommand({
    command: "dragon_send_agent_run_input",
    args: { runId, input },
  });
}

export async function sendTauriAgentRunData(
  runId: string,
  data: string,
): Promise<void> {
  await invokeTauriCommand({
    command: "dragon_send_agent_run_data",
    args: { runId, data },
  });
}

export async function resizeTauriAgentRunTerminal(input: {
  runId: string;
  cols: number;
  rows: number;
}): Promise<void> {
  await invokeTauriCommand({
    command: "dragon_resize_agent_run_terminal",
    args: input,
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
