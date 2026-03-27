import { useEffect } from "react";
import { useAppStore } from "../store";

export function useThemeSync() {
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
}
