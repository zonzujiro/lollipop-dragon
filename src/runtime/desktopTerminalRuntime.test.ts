import { beforeEach, describe, expect, it } from "vitest";
import { desktopTerminalRuntime } from "./desktopTerminalRuntime";

beforeEach(() => {
  window.__TAURI__ = undefined;
});

describe("desktop terminal runtime", () => {
  it("does not report terminal attachment support yet", async () => {
    expect(desktopTerminalRuntime.canShowTerminal).toBe(false);

    await expect(desktopTerminalRuntime.attach("run-1")).rejects.toThrow(
      "Desktop runtime bridge is unavailable",
    );
  });
});
