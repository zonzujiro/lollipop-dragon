import { useEffect } from "react";
import type { DirectoryTarget, FileTarget } from "../../types/fileTree";
import {
  isBrowserDirectoryHandle,
  isBrowserFileHandle,
} from "../../types/fileTree";
import { watcherRuntime } from "../../runtime";

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

function supportsFileObserver(): boolean {
  // FileSystemObserver is experimental; Edge exposes it but crashes on use.
  return (
    typeof window !== "undefined" &&
    "FileSystemObserver" in window &&
    !/\bEdg\//.test(navigator.userAgent)
  );
}

interface WatcherOptions {
  handle: FileTarget | DirectoryTarget | null;
  onRefresh: () => void | Promise<void>;
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

    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function schedulePoll() {
      if (cancelled || pollTimer) {
        return;
      }
      pollTimer = setTimeout(() => {
        pollTimer = null;
        if (cancelled) {
          return;
        }
        void Promise.resolve(onRefresh())
          .catch((error: unknown) => {
            console.error("[FileSystemObserver] refresh failed:", error);
          })
          .finally(() => {
            schedulePoll();
          });
      }, pollIntervalMs);
    }

    function cleanupPolling() {
      cancelled = true;
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
    }

    if (watcherRuntime.canWatchTarget(handle)) {
      let subscription: { stop(): Promise<void> } | null = null;
      watcherRuntime
        .watchTarget({
          target: handle,
          recursive,
          onChange: onRefresh,
          onError: (error) => {
            console.error("[FileSystemWatcher] native watch failed:", error);
          },
        })
        .then((nextSubscription) => {
          if (cancelled) {
            void nextSubscription.stop().catch((error: unknown) => {
              console.error(
                "[FileSystemWatcher] native watch cleanup failed:",
                error,
              );
            });
            return;
          }

          subscription = nextSubscription;
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }

          console.warn(
            "[FileSystemWatcher] native watch setup failed, falling back to polling:",
            error,
          );
          schedulePoll();
        });

      return () => {
        cleanupPolling();
        void subscription?.stop().catch((error: unknown) => {
          console.error(
            "[FileSystemWatcher] native watch cleanup failed:",
            error,
          );
        });
      };
    }

    if (!supportsFileObserver()) {
      schedulePoll();
      return cleanupPolling;
    }

    if (!isBrowserFileHandle(handle) && !isBrowserDirectoryHandle(handle)) {
      schedulePoll();
      return cleanupPolling;
    }

    const FSObserver = window.FileSystemObserver;
    if (!FSObserver) {
      schedulePoll();
      return cleanupPolling;
    }

    const typeSet = new Set([...relevantTypes, "unknown"]);
    let observer: FileSystemObserver | null = null;
    try {
      observer = new FSObserver((records: FileSystemObserverRecord[]) => {
        const hasRelevant = records.some((r) => typeSet.has(r.type));
        const hasErrored = records.some((r) => r.type === "errored");

        if (hasRelevant) {
          void Promise.resolve(onRefresh()).catch((error: unknown) => {
            console.error("[FileSystemObserver] refresh failed:", error);
          });
        }
        if (hasErrored) {
          console.warn(
            "[FileSystemObserver] observer errored, falling back to polling",
          );
          observer?.disconnect();
          observer = null;
          schedulePoll();
        }
      });

      const observeOpts = recursive ? { recursive: true } : undefined;
      observer.observe(handle, observeOpts).catch((e: unknown) => {
        console.warn(
          "[FileSystemObserver] observe failed, falling back to polling:",
          e,
        );
        schedulePoll();
      });
    } catch (e) {
      console.warn(
        "[FileSystemObserver] setup failed, falling back to polling:",
        e,
      );
      schedulePoll();
    }

    return () => {
      cleanupPolling();
      observer?.disconnect();
    };
  }, [handle, onRefresh, pollIntervalMs, recursive, relevantTypes]);
}
