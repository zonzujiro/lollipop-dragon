export type TauriCommand =
  | "dragon_runtime_ping"
  | "dragon_agent_runtime_available";

interface TauriCoreApi {
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
}

interface TauriGlobalApi {
  core: TauriCoreApi;
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobalApi;
  }
}

export function hasTauriBridge(): boolean {
  return Boolean(window.__TAURI__?.core);
}

export function invokeTauriCommand(input: {
  command: TauriCommand;
  args?: Record<string, unknown>;
}): Promise<unknown> {
  const core = window.__TAURI__?.core;
  if (!core) {
    return Promise.reject(new Error("Tauri runtime bridge is unavailable"));
  }

  return core.invoke(input.command, input.args);
}

export async function pingTauriRuntime(): Promise<"ok"> {
  const result = await invokeTauriCommand({ command: "dragon_runtime_ping" });
  if (result === "ok") {
    return result;
  }

  throw new Error("Unexpected Tauri runtime ping response");
}

export async function getTauriAgentRuntimeAvailable(): Promise<boolean> {
  const result = await invokeTauriCommand({
    command: "dragon_agent_runtime_available",
  });
  if (typeof result === "boolean") {
    return result;
  }

  throw new Error("Unexpected Tauri agent capability response");
}
