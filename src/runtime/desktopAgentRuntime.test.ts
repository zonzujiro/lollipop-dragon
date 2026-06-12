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

  it("starts, stops, and reads runs through the native agent commands", async () => {
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
          if (command === "dragon_start_agent_run") {
            return Promise.resolve("native-run-1");
          }
          if (command === "dragon_get_agent_run_status") {
            return Promise.resolve({ status: "completed", exitCode: 0 });
          }
          return Promise.resolve(null);
        },
      },
    };

    expect(desktopAgentRuntime.canRunAgent).toBe(true);
    await expect(
      desktopAgentRuntime.startRun({
        tabId: "tab-1",
        taskKind: "answer_questions",
        targetPaths: ["docs/spec.md"],
        selectedCommentIds: [],
        prompt: "Answer questions",
        runnerKind: "terminal",
        workspaceRootPath: "/tmp/project",
      }),
    ).resolves.toBe("native-run-1");
    await desktopAgentRuntime.stopRun("native-run-1");
    await expect(
      desktopAgentRuntime.getRunStatus("native-run-1"),
    ).resolves.toEqual({
      status: "completed",
      exitCode: 0,
    });

    expect(calls).toEqual([
      {
        command: "dragon_runtime_ping",
        args: undefined,
      },
      {
        command: "dragon_start_agent_run",
        args: {
          request: {
            tabId: "tab-1",
            taskKind: "answer_questions",
            targetPaths: ["docs/spec.md"],
            selectedCommentIds: [],
            prompt: "Answer questions",
            runnerKind: "terminal",
            workspaceRootPath: "/tmp/project",
          },
        },
      },
      {
        command: "dragon_runtime_ping",
        args: undefined,
      },
      {
        command: "dragon_stop_agent_run",
        args: {
          runId: "native-run-1",
        },
      },
      {
        command: "dragon_runtime_ping",
        args: undefined,
      },
      {
        command: "dragon_get_agent_run_status",
        args: {
          runId: "native-run-1",
        },
      },
    ]);
  });
});
