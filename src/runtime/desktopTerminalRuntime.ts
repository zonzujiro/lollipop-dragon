import type { TerminalRuntime } from "./terminal";
import { assertDesktopRuntimeAvailable } from "./desktopAgentRuntime";
import {
  resizeTauriAgentRunTerminal,
  sendTauriAgentRunData,
  sendTauriAgentRunInput,
} from "./tauriBridge";

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
  sendData: async (runId, data) => {
    await assertDesktopRuntimeAvailable();
    await sendTauriAgentRunData(runId, data);
  },
  resize: async (runId, dimensions) => {
    await assertDesktopRuntimeAvailable();
    await resizeTauriAgentRunTerminal({
      runId,
      cols: dimensions.cols,
      rows: dimensions.rows,
    });
  },
};
