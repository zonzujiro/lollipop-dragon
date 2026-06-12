export interface TerminalAttachment {
  id: string;
  runId: string;
}

export interface TerminalRuntime {
  canShowTerminal: boolean;
  attach(runId: string): Promise<TerminalAttachment>;
}

export const webTerminalRuntime: TerminalRuntime = {
  canShowTerminal: false,
  attach: () =>
    Promise.reject(new Error("Terminal sessions are unavailable on web")),
};
