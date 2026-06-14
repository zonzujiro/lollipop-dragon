import type { AgentRuntime, AgentRuntimeCapability } from "./agent";
import {
  clearTauriAgentConfig,
  detectTauriAgentClis,
  getTauriAgentConfig,
  getTauriAgentRuntimeAvailable,
  getTauriAgentRunStatus,
  hasTauriBridge,
  pingTauriRuntime,
  saveTauriAgentConfig,
  startTauriAgentRun,
  stopTauriAgentRun,
  testTauriAgentCommand,
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
        "Configure a desktop agent command before starting local agent runs.",
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

export async function getDesktopAgentConfig() {
  await assertDesktopRuntimeAvailable();
  return getTauriAgentConfig();
}

export async function saveDesktopAgentConfig(command: string): Promise<void> {
  await assertDesktopRuntimeAvailable();
  await saveTauriAgentConfig(command);
}

export async function clearDesktopAgentConfig(): Promise<void> {
  await assertDesktopRuntimeAvailable();
  await clearTauriAgentConfig();
}

export async function detectDesktopAgentClis() {
  await assertDesktopRuntimeAvailable();
  return detectTauriAgentClis();
}

export async function testDesktopAgentCommand(command: string) {
  await assertDesktopRuntimeAvailable();
  return testTauriAgentCommand(command);
}
