import type { AgentRuntime } from "./agent";
import {
  getTauriAgentRuntimeAvailable,
  hasTauriBridge,
  pingTauriRuntime,
  startTauriAgentRun,
  stopTauriAgentRun,
} from "./tauriBridge";

export async function assertDesktopRuntimeAvailable(): Promise<void> {
  if (!hasTauriBridge()) {
    throw new Error("Desktop runtime bridge is unavailable");
  }

  await pingTauriRuntime();
}

export async function getDesktopAgentCapability(): Promise<boolean> {
  await assertDesktopRuntimeAvailable();
  return getTauriAgentRuntimeAvailable();
}

export const desktopAgentRuntime: AgentRuntime = {
  canRunAgent: true,
  startRun: async (request) => {
    await assertDesktopRuntimeAvailable();
    return startTauriAgentRun(request);
  },
  stopRun: async (runId) => {
    await assertDesktopRuntimeAvailable();
    await stopTauriAgentRun(runId);
  },
};
