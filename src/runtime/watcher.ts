import type { DirectoryTarget, FileTarget } from "../types/fileTree";

export interface WatcherSubscription {
  stop(): Promise<void>;
}

export interface WatchTargetChangeHandler {
  onChange: () => void | Promise<void>;
  onError?: (error: unknown) => void;
}

export interface WatchTargetOptions extends WatchTargetChangeHandler {
  target: FileTarget | DirectoryTarget;
  recursive: boolean;
}

export interface WatcherRuntime {
  canWatchTarget(target: FileTarget | DirectoryTarget): boolean;
  watchTarget(options: WatchTargetOptions): Promise<WatcherSubscription>;
}

export const webWatcherRuntime: WatcherRuntime = {
  canWatchTarget: () => false,
  watchTarget: () =>
    Promise.reject(
      new Error("Native filesystem watching is unavailable on web"),
    ),
};
