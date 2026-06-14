import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desktopWatcherRuntime } from "./desktopWatcherRuntime";
import type { NativeWorkspaceDirectoryTarget } from "./workspace";

beforeEach(() => {
  vi.useFakeTimers();
  window.__TAURI__ = undefined;
});

afterEach(() => {
  vi.useRealTimers();
  window.__TAURI__ = undefined;
});

describe("desktop watcher runtime", () => {
  it("rejects when the desktop bridge is unavailable", async () => {
    const target: NativeWorkspaceDirectoryTarget = {
      kind: "native_directory",
      name: "project",
      path: "C:\\project",
    };

    await expect(
      desktopWatcherRuntime.watchTarget({
        target,
        recursive: true,
        onChange: vi.fn(),
      }),
    ).rejects.toThrow("Desktop runtime bridge is unavailable");
  });

  it("starts, polls, and stops native path watches", async () => {
    const calls: {
      command: string;
      args: Record<string, unknown> | undefined;
    }[] = [];
    const onChange = vi.fn();
    let hasChange = true;
    window.__TAURI__ = {
      core: {
        invoke: (command, args) => {
          calls.push({ command, args });
          if (command === "dragon_runtime_ping") {
            return Promise.resolve("ok");
          }
          if (command === "dragon_start_path_watch") {
            return Promise.resolve("watch-1");
          }
          if (command === "dragon_take_path_watch_events") {
            const changed = hasChange;
            hasChange = false;
            return Promise.resolve(changed);
          }
          return Promise.resolve(null);
        },
      },
    };
    const target: NativeWorkspaceDirectoryTarget = {
      kind: "native_directory",
      name: "project",
      path: "C:\\project",
    };

    const subscription = await desktopWatcherRuntime.watchTarget({
      target,
      recursive: true,
      onChange,
    });
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(500);
    await subscription.stop();

    expect(onChange).toHaveBeenCalledOnce();
    expect(calls).toEqual([
      {
        command: "dragon_runtime_ping",
        args: undefined,
      },
      {
        command: "dragon_start_path_watch",
        args: { path: "C:\\project", recursive: true },
      },
      {
        command: "dragon_take_path_watch_events",
        args: { watchId: "watch-1" },
      },
      {
        command: "dragon_take_path_watch_events",
        args: { watchId: "watch-1" },
      },
      {
        command: "dragon_stop_path_watch",
        args: { watchId: "watch-1" },
      },
    ]);
  });
});
