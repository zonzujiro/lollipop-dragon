import { desktopAgentRuntime } from "./desktopAgentRuntime";
import { desktopTerminalRuntime } from "./desktopTerminalRuntime";
import { desktopWatcherRuntime } from "./desktopWatcherRuntime";
import { desktopWorkspaceRuntime } from "./desktopWorkspaceRuntime";

export const desktopRuntime = {
  workspaceRuntime: desktopWorkspaceRuntime,
  agentRuntime: desktopAgentRuntime,
  terminalRuntime: desktopTerminalRuntime,
  watcherRuntime: desktopWatcherRuntime,
};

export {
  assertDesktopRuntimeAvailable,
  clearDesktopAgentConfig,
  detectDesktopAgentClis,
  desktopAgentRuntime,
  getDesktopAgentCapability,
  getDesktopAgentCapabilityStatus,
  getDesktopAgentConfig,
  saveDesktopAgentConfig,
  testDesktopAgentCommand,
} from "./desktopAgentRuntime";
export { desktopTerminalRuntime } from "./desktopTerminalRuntime";
export { desktopWatcherRuntime } from "./desktopWatcherRuntime";
export { desktopWorkspaceRuntime } from "./desktopWorkspaceRuntime";
