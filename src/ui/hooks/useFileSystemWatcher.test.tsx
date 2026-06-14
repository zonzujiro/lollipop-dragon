import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeFileTarget } from "../../types/fileTree";
import { useFileSystemWatcher } from "./useFileSystemWatcher";

interface ObserveCall {
  handle: FileSystemHandle;
  options?: { recursive: boolean };
}

const observeCalls: ObserveCall[] = [];

class TestFileSystemObserver {
  constructor(callback: (records: { type: string }[]) => void) {
    void callback;
  }

  observe(
    handle: FileSystemHandle,
    options?: { recursive: boolean },
  ): Promise<void> {
    observeCalls.push({ handle, options });
    return Promise.resolve();
  }

  disconnect(): void {}
}

function createBrowserFileHandle(name: string): FileSystemFileHandle {
  return {
    kind: "file",
    name,
    isSameEntry: vi.fn(),
    queryPermission: vi.fn(),
    requestPermission: vi.fn(),
    getFile: vi.fn(),
    createWritable: vi.fn(),
  };
}

describe("useFileSystemWatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    observeCalls.length = 0;
    window.FileSystemObserver = TestFileSystemObserver;
  });

  afterEach(() => {
    cleanup();
    window.FileSystemObserver = undefined;
    vi.useRealTimers();
  });

  it("uses polling for native desktop targets even when FileSystemObserver exists", async () => {
    const nativeTarget: NativeFileTarget = {
      kind: "native_file",
      name: "notes.md",
      path: "/tmp/notes.md",
    };
    const onRefresh = vi.fn();

    renderHook(() =>
      useFileSystemWatcher({
        handle: nativeTarget,
        onRefresh,
        pollIntervalMs: 25,
        relevantTypes: ["modified"],
      }),
    );

    expect(observeCalls).toEqual([]);

    await vi.advanceTimersByTimeAsync(25);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("uses FileSystemObserver for browser file handles when available", async () => {
    const browserHandle = createBrowserFileHandle("notes.md");
    const onRefresh = vi.fn();

    renderHook(() =>
      useFileSystemWatcher({
        handle: browserHandle,
        onRefresh,
        pollIntervalMs: 25,
        relevantTypes: ["modified"],
      }),
    );

    expect(observeCalls).toHaveLength(1);
    expect(observeCalls[0].handle).toBe(browserHandle);

    await vi.advanceTimersByTimeAsync(25);

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
