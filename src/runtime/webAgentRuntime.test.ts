import { describe, expect, it } from "vitest";
import { agentRuntime, canRunAgent, canShowTerminal, terminalRuntime } from ".";

describe("web agent runtime capabilities", () => {
  it("reports that local agent execution is unavailable on web", async () => {
    expect(canRunAgent).toBe(false);
    expect(agentRuntime.canRunAgent).toBe(false);
    await expect(agentRuntime.getCapability()).resolves.toEqual({
      canRunAgent: false,
      unavailableMessage: "Local agent execution is unavailable on web.",
    });

    await expect(
      agentRuntime.startRun({
        tabId: "tab-1",
        taskKind: "address_comments",
        targetPaths: ["docs/spec.md"],
        selectedCommentIds: [],
        prompt: "Address comments",
        runnerKind: null,
        workspaceRootPath: null,
      }),
    ).rejects.toThrow("Local agent execution is unavailable on web");
  });

  it("reports that terminal attachment is unavailable on web", async () => {
    expect(canShowTerminal).toBe(false);
    expect(terminalRuntime.canShowTerminal).toBe(false);

    await expect(terminalRuntime.attach("run-1")).rejects.toThrow(
      "Terminal sessions are unavailable on web",
    );
    await expect(terminalRuntime.sendData("run-1", "x")).rejects.toThrow(
      "Terminal sessions are unavailable on web",
    );
    await expect(
      terminalRuntime.resize("run-1", { cols: 80, rows: 24 }),
    ).rejects.toThrow("Terminal sessions are unavailable on web");
  });
});
