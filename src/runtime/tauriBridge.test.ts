import { beforeEach, describe, expect, it } from "vitest";
import {
  getTauriAgentRuntimeAvailable,
  hasTauriBridge,
  invokeTauriCommand,
  pingTauriRuntime,
} from "./tauriBridge";

beforeEach(() => {
  window.__TAURI__ = undefined;
});

describe("tauri bridge", () => {
  it("reports unavailable outside the desktop shell", async () => {
    expect(hasTauriBridge()).toBe(false);

    await expect(
      invokeTauriCommand({ command: "dragon_runtime_ping" }),
    ).rejects.toThrow("Tauri runtime bridge is unavailable");
  });

  it("invokes desktop commands through the global Tauri core API", async () => {
    const calls: {
      command: string;
      args: Record<string, unknown> | undefined;
    }[] = [];
    window.__TAURI__ = {
      core: {
        invoke: (command, args) => {
          calls.push({ command, args });
          return Promise.resolve("ok");
        },
      },
    };

    await expect(pingTauriRuntime()).resolves.toBe("ok");
    expect(hasTauriBridge()).toBe(true);
    expect(calls).toEqual([
      {
        command: "dragon_runtime_ping",
        args: undefined,
      },
    ]);
  });

  it("reads the desktop agent capability command", async () => {
    window.__TAURI__ = {
      core: {
        invoke: () => Promise.resolve(false),
      },
    };

    await expect(getTauriAgentRuntimeAvailable()).resolves.toBe(false);
  });

  it("rejects unexpected command response shapes", async () => {
    window.__TAURI__ = {
      core: {
        invoke: () => Promise.resolve("nope"),
      },
    };

    await expect(getTauriAgentRuntimeAvailable()).rejects.toThrow(
      "Unexpected Tauri agent capability response",
    );
  });
});
