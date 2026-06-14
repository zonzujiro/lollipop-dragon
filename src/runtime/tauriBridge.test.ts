import { beforeEach, describe, expect, it } from "vitest";
import {
  getTauriAgentRuntimeAvailable,
  clearTauriAgentConfig,
  detectTauriAgentClis,
  getTauriAgentRunStatus,
  getTauriAgentConfig,
  hasTauriBridge,
  invokeTauriCommand,
  openTauriDirectory,
  openTauriTextFile,
  pingTauriRuntime,
  readTauriDirectoryTree,
  readTauriTextFile,
  saveTauriAgentConfig,
  sendTauriAgentRunInput,
  startTauriAgentRun,
  stopTauriAgentRun,
  testTauriAgentCommand,
  writeTauriTextFile,
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

  it("reads, saves, clears, detects, and tests desktop agent setup", async () => {
    const calls: {
      command: string;
      args: Record<string, unknown> | undefined;
    }[] = [];
    window.__TAURI__ = {
      core: {
        invoke: (command, args) => {
          calls.push({ command, args });
          if (command === "dragon_get_agent_config") {
            return Promise.resolve({
              command: "codex",
              source: "config",
            });
          }
          if (command === "dragon_detect_agent_clis") {
            return Promise.resolve([
              {
                id: "codex",
                label: "Codex",
                command: "codex",
                path: "C:\\Tools\\codex.exe",
                available: true,
                version: "codex 1.0.0",
              },
            ]);
          }
          if (command === "dragon_test_agent_command") {
            return Promise.resolve({
              ok: true,
              message: "Command responded to --version",
              output: "codex 1.0.0",
            });
          }
          return Promise.resolve(null);
        },
      },
    };

    await expect(getTauriAgentConfig()).resolves.toEqual({
      command: "codex",
      source: "config",
    });
    await saveTauriAgentConfig("codex");
    await clearTauriAgentConfig();
    await expect(detectTauriAgentClis()).resolves.toEqual([
      {
        id: "codex",
        label: "Codex",
        command: "codex",
        path: "C:\\Tools\\codex.exe",
        available: true,
        version: "codex 1.0.0",
      },
    ]);
    await expect(testTauriAgentCommand("codex")).resolves.toEqual({
      ok: true,
      message: "Command responded to --version",
      output: "codex 1.0.0",
    });

    expect(calls).toEqual([
      {
        command: "dragon_get_agent_config",
        args: undefined,
      },
      {
        command: "dragon_save_agent_config",
        args: { command: "codex" },
      },
      {
        command: "dragon_clear_agent_config",
        args: undefined,
      },
      {
        command: "dragon_detect_agent_clis",
        args: undefined,
      },
      {
        command: "dragon_test_agent_command",
        args: { command: "codex" },
      },
    ]);
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

  it("starts, stops, sends input, and reads native agent runs through Tauri commands", async () => {
    const calls: {
      command: string;
      args: Record<string, unknown> | undefined;
    }[] = [];
    window.__TAURI__ = {
      core: {
        invoke: (command, args) => {
          calls.push({ command, args });
          if (command === "dragon_get_agent_run_status") {
            return Promise.resolve({ status: "running", output: "Working\n" });
          }
          return Promise.resolve("native-run-1");
        },
      },
    };
    const request = {
      tabId: "tab-1",
      taskKind: "answer_questions",
      targetPaths: ["docs/spec.md"],
      selectedCommentIds: ["mr-question-1"],
      prompt: "Answer questions",
      runnerKind: "terminal",
      workspaceRootPath: "/tmp/project",
    };

    await expect(startTauriAgentRun(request)).resolves.toBe("native-run-1");
    await stopTauriAgentRun("native-run-1");
    await sendTauriAgentRunInput("native-run-1", "continue");
    await expect(getTauriAgentRunStatus("native-run-1")).resolves.toEqual({
      status: "running",
      output: "Working\n",
    });

    expect(calls).toEqual([
      {
        command: "dragon_start_agent_run",
        args: { request },
      },
      {
        command: "dragon_stop_agent_run",
        args: { runId: "native-run-1" },
      },
      {
        command: "dragon_send_agent_run_input",
        args: { runId: "native-run-1", input: "continue" },
      },
      {
        command: "dragon_get_agent_run_status",
        args: { runId: "native-run-1" },
      },
    ]);
  });

  it("rejects malformed native agent run responses", async () => {
    window.__TAURI__ = {
      core: {
        invoke: () => Promise.resolve(null),
      },
    };

    await expect(
      startTauriAgentRun({
        tabId: "tab-1",
        taskKind: "answer_questions",
        targetPaths: ["docs/spec.md"],
        selectedCommentIds: [],
        prompt: "Answer questions",
        runnerKind: "terminal",
        workspaceRootPath: null,
      }),
    ).rejects.toThrow("Unexpected native agent run response");
  });

  it("rejects malformed native agent run status responses", async () => {
    window.__TAURI__ = {
      core: {
        invoke: () =>
          Promise.resolve({
            status: "completed",
            exitCode: "0",
            output: "",
          }),
      },
    };

    await expect(getTauriAgentRunStatus("native-run-1")).rejects.toThrow(
      "Unexpected native agent run exitCode field",
    );
  });

  it("reads and writes native text files through Tauri commands", async () => {
    const calls: {
      command: string;
      args: Record<string, unknown> | undefined;
    }[] = [];
    window.__TAURI__ = {
      core: {
        invoke: (command, args) => {
          calls.push({ command, args });
          if (command === "dragon_read_text_file") {
            return Promise.resolve("# Notes");
          }
          return Promise.resolve(null);
        },
      },
    };
    const target = {
      kind: "native_file",
      path: "/tmp/notes.md",
      name: "notes.md",
    };

    await expect(readTauriTextFile(target)).resolves.toBe("# Notes");
    await writeTauriTextFile(target, "# Updated");

    expect(calls).toEqual([
      {
        command: "dragon_read_text_file",
        args: { path: "/tmp/notes.md" },
      },
      {
        command: "dragon_write_text_file",
        args: { path: "/tmp/notes.md", content: "# Updated" },
      },
    ]);
  });

  it("opens native file and directory targets through Tauri commands", async () => {
    const calls: string[] = [];
    window.__TAURI__ = {
      core: {
        invoke: (command) => {
          calls.push(command);
          if (command === "dragon_open_text_file") {
            return Promise.resolve({
              path: "/tmp/project/notes.md",
              name: "notes.md",
            });
          }
          return Promise.resolve({
            path: "/tmp/project",
            name: "project",
          });
        },
      },
    };

    await expect(openTauriTextFile()).resolves.toEqual({
      kind: "native_file",
      path: "/tmp/project/notes.md",
      name: "notes.md",
    });
    await expect(openTauriDirectory()).resolves.toEqual({
      kind: "native_directory",
      path: "/tmp/project",
      name: "project",
    });
    expect(calls).toEqual(["dragon_open_text_file", "dragon_open_directory"]);
  });

  it("returns null when native open dialogs are cancelled", async () => {
    window.__TAURI__ = {
      core: {
        invoke: () => Promise.resolve(null),
      },
    };

    await expect(openTauriTextFile()).resolves.toBeNull();
    await expect(openTauriDirectory()).resolves.toBeNull();
  });

  it("rejects malformed native open dialog responses", async () => {
    window.__TAURI__ = {
      core: {
        invoke: () =>
          Promise.resolve({
            path: "/tmp/project/notes.md",
          }),
      },
    };

    await expect(openTauriTextFile()).rejects.toThrow(
      "Unexpected native file tree name field",
    );
  });

  it("reads native directory trees through Tauri commands", async () => {
    window.__TAURI__ = {
      core: {
        invoke: () =>
          Promise.resolve([
            {
              kind: "directory",
              name: "docs",
              path: "docs",
              children: [
                {
                  kind: "file",
                  name: "intro.md",
                  path: "docs/intro.md",
                },
              ],
            },
          ]),
      },
    };

    await expect(
      readTauriDirectoryTree({
        kind: "native_directory",
        path: "/tmp/project",
        name: "project",
      }),
    ).resolves.toEqual([
      {
        kind: "directory",
        name: "docs",
        path: "docs",
        children: [
          {
            kind: "file",
            name: "intro.md",
            path: "docs/intro.md",
          },
        ],
      },
    ]);
  });

  it("rejects malformed native directory tree responses", async () => {
    window.__TAURI__ = {
      core: {
        invoke: () =>
          Promise.resolve([
            {
              kind: "file",
              name: "intro.md",
            },
          ]),
      },
    };

    await expect(
      readTauriDirectoryTree({
        kind: "native_directory",
        path: "/tmp/project",
        name: "project",
      }),
    ).rejects.toThrow("Unexpected native file tree path field");
  });
});
