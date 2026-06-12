import { webAgentRuntime } from "./agent";
import type { RuntimeBundle } from "./runtimeBundle";
import { webTerminalRuntime } from "./terminal";
import { webWorkspaceRuntime } from "./webWorkspaceRuntime";

export const activeRuntime: RuntimeBundle = {
  workspaceRuntime: webWorkspaceRuntime,
  agentRuntime: webAgentRuntime,
  terminalRuntime: webTerminalRuntime,
};
