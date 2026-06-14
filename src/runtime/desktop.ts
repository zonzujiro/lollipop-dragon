import { desktopAgentRuntime } from "./desktopAgentRuntime";
import { desktopTerminalRuntime } from "./desktopTerminalRuntime";
import { desktopWorkspaceRuntime } from "./desktopWorkspaceRuntime";

export const desktopRuntime = {
  workspaceRuntime: desktopWorkspaceRuntime,
  agentRuntime: desktopAgentRuntime,
  terminalRuntime: desktopTerminalRuntime,
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
export { desktopWorkspaceRuntime } from "./desktopWorkspaceRuntime";
