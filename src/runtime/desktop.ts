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
  desktopAgentRuntime,
  getDesktopAgentCapability,
  getDesktopAgentCapabilityStatus,
} from "./desktopAgentRuntime";
export { desktopTerminalRuntime } from "./desktopTerminalRuntime";
export { desktopWorkspaceRuntime } from "./desktopWorkspaceRuntime";
