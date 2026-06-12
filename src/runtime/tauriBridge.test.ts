import { beforeEach, describe, expect, it } from "vitest";
import {
  getTauriAgentRuntimeAvailable,
  hasTauriBridge,
  invokeTauriCommand,
  pingTauriRuntime,
  readTauriDirectoryTree,
  readTauriTextFile,
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
