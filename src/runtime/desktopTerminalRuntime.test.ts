import { beforeEach, describe, expect, it } from "vitest";
import { desktopTerminalRuntime } from "./desktopTerminalRuntime";

beforeEach(() => {
  window.__TAURI__ = undefined;
});

describe("desktop terminal runtime", () => {
  it("rejects when the desktop bridge is unavailable", async () => {
    expect(desktopTerminalRuntime.canShowTerminal).toBe(true);

    await expect(desktopTerminalRuntime.attach("run-1")).rejects.toThrow(
      "Desktop runtime bridge is unavailable",
    );
  });

  it("attaches and sends input through native terminal commands", async () => {
    const calls: {
      command: string;
      args: Record<string, unknown> | undefined;
    }[] = [];
    window.__TAURI__ = {
      core: {
        invoke: (command, args) => {
          calls.push({ command, args });
          if (command === "dragon_runtime_ping") {
            return Promise.resolve("ok");
          }
          return Promise.resolve(null);
        },
      },
    };

    await expect(desktopTerminalRuntime.attach("run-1")).resolves.toEqual({
      id: "run-1",
      runId: "run-1",
    });
    await desktopTerminalRuntime.sendInput("run-1", "continue");

    expect(calls).toEqual([
      {
        command: "dragon_runtime_ping",
        args: undefined,
      },
      {
        command: "dragon_runtime_ping",
        args: undefined,
      },
      {
        command: "dragon_send_agent_run_input",
        args: {
          runId: "run-1",
          input: "continue",
        },
      },
    ]);
  });
});
