import { beforeEach, describe, expect, it } from "vitest";
import {
  getTauriAgentRuntimeAvailable,
  hasTauriBridge,
  invokeTauriCommand,
  openTauriDirectory,
  openTauriTextFile,
  pingTauriRuntime,
  readTauriDirectoryTree,
  readTauriTextFile,
  startTauriAgentRun,
  stopTauriAgentRun,
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

  it("starts and stops native agent runs through Tauri commands", async () => {
    const calls: {
      command: string;
      args: Record<string, unknown> | undefined;
    }[] = [];
    window.__TAURI__ = {
      core: {
        invoke: (command, args) => {
          calls.push({ command, args });
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

    expect(calls).toEqual([
      {
        command: "dragon_start_agent_run",
        args: { request },
      },
      {
        command: "dragon_stop_agent_run",
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
