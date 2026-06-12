import type { AgentRuntime } from "./agent";
import type { TerminalRuntime } from "./terminal";
import type { WorkspaceRuntime } from "./workspace";

export interface RuntimeBundle {
  workspaceRuntime: WorkspaceRuntime;
  agentRuntime: AgentRuntime;
  terminalRuntime: TerminalRuntime;
}
