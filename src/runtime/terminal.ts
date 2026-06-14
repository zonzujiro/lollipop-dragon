export interface TerminalAttachment {
  id: string;
  runId: string;
}

export interface TerminalRuntime {
  canShowTerminal: boolean;
  attach(runId: string): Promise<TerminalAttachment>;
  sendInput(runId: string, input: string): Promise<void>;
}

export const webTerminalRuntime: TerminalRuntime = {
  canShowTerminal: false,
  attach: () =>
    Promise.reject(new Error("Terminal sessions are unavailable on web")),
  sendInput: () =>
    Promise.reject(new Error("Terminal sessions are unavailable on web")),
};
