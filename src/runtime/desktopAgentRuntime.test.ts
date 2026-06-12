import { beforeEach, describe, expect, it } from "vitest";
import {
  assertDesktopRuntimeAvailable,
  desktopAgentRuntime,
  getDesktopAgentCapability,
} from "./desktopAgentRuntime";

beforeEach(() => {
  window.__TAURI__ = undefined;
});

describe("desktop agent runtime", () => {
  it("rejects when the desktop bridge is unavailable", async () => {
    await expect(assertDesktopRuntimeAvailable()).rejects.toThrow(
      "Desktop runtime bridge is unavailable",
    );
  });

  it("reads the native agent capability through the Tauri bridge", async () => {
    window.__TAURI__ = {
      core: {
        invoke: (command) => {
          if (command === "dragon_runtime_ping") {
            return Promise.resolve("ok");
          }
          return Promise.resolve(false);
        },
      },
    };

    await expect(getDesktopAgentCapability()).resolves.toBe(false);
  });

  it("does not report runnable agent support until a runner is configured", async () => {
    window.__TAURI__ = {
      core: {
        invoke: (command) => {
          if (command === "dragon_runtime_ping") {
            return Promise.resolve("ok");
          }
          return Promise.resolve(false);
        },
      },
    };

    expect(desktopAgentRuntime.canRunAgent).toBe(false);
    await expect(
      desktopAgentRuntime.startRun({
        tabId: "tab-1",
        taskKind: "answer_questions",
        targetPaths: ["docs/spec.md"],
        selectedCommentIds: [],
        prompt: "Answer questions",
        runnerKind: "terminal",
      }),
    ).rejects.toThrow("Desktop agent execution is not configured");
  });
});
