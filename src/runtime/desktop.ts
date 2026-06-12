import { webWorkspaceRuntime } from "./webWorkspaceRuntime";
import { desktopAgentRuntime } from "./desktopAgentRuntime";
import { desktopTerminalRuntime } from "./desktopTerminalRuntime";

export const desktopRuntime = {
  workspaceRuntime: webWorkspaceRuntime,
  agentRuntime: desktopAgentRuntime,
  terminalRuntime: desktopTerminalRuntime,
};

export {
  assertDesktopRuntimeAvailable,
  desktopAgentRuntime,
  getDesktopAgentCapability,
} from "./desktopAgentRuntime";
export { desktopTerminalRuntime } from "./desktopTerminalRuntime";
