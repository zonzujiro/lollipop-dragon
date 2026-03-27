import { useEffect } from "react";

// FileSystemObserver is experimental; Edge exposes it but crashes on use
const supportsFileObserver =
  typeof window !== "undefined" &&
  "FileSystemObserver" in window &&
  !/\bEdg\//.test(navigator.userAgent);

interface FileSystemObserverRecord {
  type: string;
}
interface FileSystemObserver {
  observe(
    handle: FileSystemHandle,
    opts?: { recursive: boolean },
  ): Promise<void>;
  disconnect(): void;
}
interface FileSystemObserverConstructor {
  new (
    callback: (records: FileSystemObserverRecord[]) => void,
  ): FileSystemObserver;
}

declare global {
  interface Window {
    FileSystemObserver?: FileSystemObserverConstructor;
  }
}

interface WatcherOptions {
  handle: FileSystemHandle | null;
  onRefresh: () => void;
  pollIntervalMs: number;
  recursive?: boolean;
  relevantTypes: string[];
}

/**
 * Watch a file or directory for external changes.
 * Uses FileSystemObserver when available, falls back to polling.
 */
export function useFileSystemWatcher({
  handle,
  onRefresh,
  pollIntervalMs,
  recursive = false,
  relevantTypes,
}: WatcherOptions) {
  useEffect(() => {
    if (!handle) {
      return;
    }

    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      if (pollTimer) {
        return;
      }
      pollTimer = setInterval(() => onRefresh(), pollIntervalMs);
    }

    if (!supportsFileObserver) {
      startPolling();
      return () => {
        if (pollTimer) {
          clearInterval(pollTimer);
        }
      };
    }

    const FSObserver = window.FileSystemObserver;
    if (!FSObserver) {
      startPolling();
      return () => {
        if (pollTimer) {
          clearInterval(pollTimer);
        }
      };
    }

    const typeSet = new Set([...relevantTypes, "unknown"]);
    let observer: FileSystemObserver | null = null;
    try {
      observer = new FSObserver((records: FileSystemObserverRecord[]) => {
        const hasRelevant = records.some((r) => typeSet.has(r.type));
        const hasErrored = records.some((r) => r.type === "errored");

        if (hasRelevant) {
          onRefresh();
        }
        if (hasErrored) {
          console.warn(
            "[FileSystemObserver] observer errored, falling back to polling",
          );
          observer?.disconnect();
          observer = null;
          startPolling();
        }
      });

      const observeOpts = recursive ? { recursive: true } : undefined;
      observer.observe(handle, observeOpts).catch((e: unknown) => {
        console.warn(
          "[FileSystemObserver] observe failed, falling back to polling:",
          e,
        );
        startPolling();
      });
    } catch (e) {
      console.warn(
        "[FileSystemObserver] setup failed, falling back to polling:",
        e,
      );
      startPolling();
    }

    return () => {
      observer?.disconnect();
      if (pollTimer) {
        clearInterval(pollTimer);
      }
    };
  }, [handle, onRefresh, pollIntervalMs, recursive, relevantTypes]);
}
