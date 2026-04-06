import { useEffect } from "react";
import { selectTheme } from "../modules/app-shell";
import { useAppStore } from "../store";

export function useThemeSync() {
  const theme = useAppStore(selectTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
}
