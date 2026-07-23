export type AppTheme = "light" | "dark";

export interface AppShellState {
  theme: AppTheme;
  focusMode: boolean;
  agentSettingsOpen: boolean;
  toast: string | null;
}

export interface AppShellActions {
  setTheme: (theme: AppTheme) => void;
  toggleFocusMode: () => void;
  openAgentSettings: () => void;
  closeAgentSettings: () => void;
  showToast: (message: string) => void;
  dismissToast: () => void;
}
