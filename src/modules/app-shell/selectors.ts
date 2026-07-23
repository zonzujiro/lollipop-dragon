import type { AppShellState } from "./types";

export function selectTheme<StoreState extends AppShellState>(
  state: StoreState,
) {
  return state.theme;
}

export function selectFocusMode<StoreState extends AppShellState>(
  state: StoreState,
) {
  return state.focusMode;
}

export function selectToast<StoreState extends AppShellState>(
  state: StoreState,
) {
  return state.toast;
}
