export type AppTheme = "light" | "dark";

export interface AppShellState {
  theme: AppTheme;
  focusMode: boolean;
  presentationMode: boolean;
  agentSettingsOpen: boolean;
  toast: string | null;
}

export interface AppShellActions {
  setTheme: (theme: AppTheme) => void;
  toggleFocusMode: () => void;
  enterPresentationMode: () => void;
  exitPresentationMode: () => void;
  openAgentSettings: () => void;
  closeAgentSettings: () => void;
  showToast: (message: string) => void;
  dismissToast: () => void;
}
