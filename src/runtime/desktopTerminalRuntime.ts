import type { TerminalRuntime } from "./terminal";
import { assertDesktopRuntimeAvailable } from "./desktopAgentRuntime";

export const desktopTerminalRuntime: TerminalRuntime = {
  canShowTerminal: false,
  attach: async () => {
    await assertDesktopRuntimeAvailable();
    throw new Error("Desktop terminal attachment is not implemented");
  },
};
