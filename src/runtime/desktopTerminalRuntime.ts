import type { TerminalRuntime } from "./terminal";
import { assertDesktopRuntimeAvailable } from "./desktopAgentRuntime";
import { sendTauriAgentRunInput } from "./tauriBridge";

export const desktopTerminalRuntime: TerminalRuntime = {
  canShowTerminal: true,
  attach: async (runId) => {
    await assertDesktopRuntimeAvailable();
    return {
      id: runId,
      runId,
    };
  },
  sendInput: async (runId, input) => {
    await assertDesktopRuntimeAvailable();
    await sendTauriAgentRunInput(runId, input);
  },
};
