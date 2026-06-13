import type { WorkspaceRuntime } from "../runtime";

interface BrowserFileSystemWindow {
  showOpenFilePicker?: Window["showOpenFilePicker"];
}

export function shouldShowBrowserUnsupported(
  runtime: Pick<WorkspaceRuntime, "requiresBrowserFileSystemAccess">,
  hostWindow: BrowserFileSystemWindow,
): boolean {
  return (
    runtime.requiresBrowserFileSystemAccess &&
    typeof hostWindow.showOpenFilePicker !== "function"
  );
}
