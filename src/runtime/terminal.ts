export interface TerminalAttachment {
  id: string;
  runId: string;
}

export interface TerminalRuntime {
  canShowTerminal: boolean;
  attach(runId: string): Promise<TerminalAttachment>;
  sendInput(runId: string, input: string): Promise<void>;
  sendData(runId: string, data: string): Promise<void>;
  resize(
    runId: string,
    dimensions: { cols: number; rows: number },
  ): Promise<void>;
}

export const webTerminalRuntime: TerminalRuntime = {
  canShowTerminal: false,
  attach: () =>
    Promise.reject(new Error("Terminal sessions are unavailable on web")),
  sendInput: () =>
    Promise.reject(new Error("Terminal sessions are unavailable on web")),
  sendData: () =>
    Promise.reject(new Error("Terminal sessions are unavailable on web")),
  resize: () =>
    Promise.reject(new Error("Terminal sessions are unavailable on web")),
};
