import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

function runtimeModuleForMode(mode: string): string {
  if (mode === "desktop") {
    return fileURLToPath(
      new URL("./src/runtime/runtime.desktop.ts", import.meta.url),
    );
  }

  return fileURLToPath(
    new URL("./src/runtime/runtime.web.ts", import.meta.url),
  );
}

export default defineConfig(({ mode }) => ({
  base: "/",
  plugins: react(),
  resolve: {
    alias: [
      {
        find: "./runtime.active",
        replacement: runtimeModuleForMode(mode),
      },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/testing/setup.ts",
    onConsoleLog(log, type) {
      if (type === "stderr") {
        throw new Error(`Unexpected test stderr:\n${log}`);
      }
      return false;
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/testing/**",
        "src/**/*.d.ts",
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 70,
        statements: 60,
        "src/modules/relay/**": {
          lines: 50,
          functions: 65,
          branches: 45,
          statements: 50,
        },
        "src/modules/sharing/**": {
          lines: 55,
          functions: 65,
          branches: 60,
          statements: 55,
        },
        "src/modules/workspace/**": {
          lines: 55,
          functions: 75,
          branches: 70,
          statements: 55,
        },
      },
    },
  },
}));
