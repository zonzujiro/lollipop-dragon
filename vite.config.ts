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
      },
    },
  },
}));
