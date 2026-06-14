import {
  isNativeWorkspaceDirectoryTarget,
  isNativeWorkspaceFileTarget,
} from "./workspace";
import type { WatcherRuntime, WatcherSubscription } from "./watcher";
import { assertDesktopRuntimeAvailable } from "./desktopAgentRuntime";
import {
  startTauriPathWatch,
  stopTauriPathWatch,
  takeTauriPathWatchEvents,
} from "./tauriBridge";

const WATCH_POLL_INTERVAL_MS = 500;

function createStoppedSubscription(): WatcherSubscription {
  return {
    stop: () => Promise.resolve(),
  };
}

export const desktopWatcherRuntime: WatcherRuntime = {
  canWatchTarget: (target) =>
    isNativeWorkspaceFileTarget(target) ||
    isNativeWorkspaceDirectoryTarget(target),
  watchTarget: async ({ target, recursive, onChange, onError }) => {
    if (
      !isNativeWorkspaceFileTarget(target) &&
      !isNativeWorkspaceDirectoryTarget(target)
    ) {
      return createStoppedSubscription();
    }

    await assertDesktopRuntimeAvailable();
    const watchId = await startTauriPathWatch({
      path: target.path,
      recursive,
    });
    let stopped = false;
    let pendingRefresh = false;

    async function pollWatch() {
      if (stopped || pendingRefresh) {
        return;
      }

      try {
        const changed = await takeTauriPathWatchEvents(watchId);
        if (!changed || stopped) {
          return;
        }

        pendingRefresh = true;
        await onChange();
      } catch (error) {
        onError?.(error);
      } finally {
        pendingRefresh = false;
      }
    }

    const intervalId = window.setInterval(() => {
      void pollWatch();
    }, WATCH_POLL_INTERVAL_MS);

    return {
      stop: async () => {
        if (stopped) {
          return;
        }

        stopped = true;
        window.clearInterval(intervalId);
        await stopTauriPathWatch(watchId);
      },
    };
  },
};
