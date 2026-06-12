import type { AgentRuntime } from "./agent";
import {
  getTauriAgentRuntimeAvailable,
  hasTauriBridge,
  pingTauriRuntime,
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
  canRunAgent: false,
  startRun: async () => {
    const canRunAgent = await getDesktopAgentCapability();
    if (!canRunAgent) {
      throw new Error("Desktop agent execution is not configured");
    }

    throw new Error("Desktop agent runner command is not implemented");
  },
  stopRun: () => Promise.resolve(),
};
