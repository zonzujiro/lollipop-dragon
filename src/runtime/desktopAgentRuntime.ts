import type { AgentRuntime, AgentRuntimeCapability } from "./agent";
import {
  getTauriAgentRuntimeAvailable,
  getTauriAgentRunStatus,
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
  const capability = await getDesktopAgentCapabilityStatus();
  return capability.canRunAgent;
}

export async function getDesktopAgentCapabilityStatus(): Promise<AgentRuntimeCapability> {
  try {
    await assertDesktopRuntimeAvailable();
    const canRunAgent = await getTauriAgentRuntimeAvailable();
    if (canRunAgent) {
      return {
        canRunAgent: true,
        unavailableMessage: null,
      };
    }

    return {
      canRunAgent: false,
      unavailableMessage:
        "Configure DRAGON_AGENT_COMMAND before starting local agent runs.",
    };
  } catch (error) {
    const unavailableMessage =
      error instanceof Error
        ? error.message
        : "Desktop agent runtime is unavailable.";
    return {
      canRunAgent: false,
      unavailableMessage,
    };
  }
}

export const desktopAgentRuntime: AgentRuntime = {
  canRunAgent: true,
  getCapability: getDesktopAgentCapabilityStatus,
  startRun: async (request) => {
    await assertDesktopRuntimeAvailable();
    return startTauriAgentRun(request);
  },
  stopRun: async (runId) => {
    await assertDesktopRuntimeAvailable();
    await stopTauriAgentRun(runId);
  },
  getRunStatus: async (runId) => {
    await assertDesktopRuntimeAvailable();
    return getTauriAgentRunStatus(runId);
  },
};
