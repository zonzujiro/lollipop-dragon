import type { AgentRuntime } from "./agent";
import type { TerminalRuntime } from "./terminal";
import type { WatcherRuntime } from "./watcher";
import type { WorkspaceRuntime } from "./workspace";

export interface RuntimeBundle {
  workspaceRuntime: WorkspaceRuntime;
  agentRuntime: AgentRuntime;
  terminalRuntime: TerminalRuntime;
  watcherRuntime: WatcherRuntime;
}
