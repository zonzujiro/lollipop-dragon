import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../../store";
import { resetTestStore } from "../../../testing/testHelpers";
import { AgentSettingsDialog } from "./AgentSettingsDialog";

const runtimeMocks = vi.hoisted(() => ({
  getDesktopAgentConfig: vi.fn(),
  detectDesktopAgentClis: vi.fn(),
  saveDesktopAgentConfig: vi.fn(),
  clearDesktopAgentConfig: vi.fn(),
  testDesktopAgentCommand: vi.fn(),
}));

vi.mock("../../../runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../runtime")>();
  return {
    ...actual,
    ...runtimeMocks,
  };
});

beforeEach(() => {
  resetTestStore();
  vi.restoreAllMocks();
  runtimeMocks.getDesktopAgentConfig.mockResolvedValue({
    command: null,
    source: null,
  });
  runtimeMocks.detectDesktopAgentClis.mockResolvedValue([
    {
      id: "codex",
      label: "Codex",
      command: "codex",
      path: "C:\\Tools\\codex.exe",
      available: true,
      version: "codex 1.0.0",
    },
  ]);
  runtimeMocks.saveDesktopAgentConfig.mockResolvedValue(undefined);
  runtimeMocks.clearDesktopAgentConfig.mockResolvedValue(undefined);
  runtimeMocks.testDesktopAgentCommand.mockResolvedValue({
    ok: true,
    message: "Command responded to --version",
    output: "codex 1.0.0",
  });
});

describe("AgentSettingsDialog", () => {
  it("loads detected CLIs and saves the selected command", async () => {
    const user = userEvent.setup();
    useAppStore.setState({ agentSettingsOpen: true });

    render(<AgentSettingsDialog />);

    expect(
      await screen.findByRole("heading", { name: "Desktop agent" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Codex")).toBeInTheDocument();
    expect(screen.getByText("C:\\Tools\\codex.exe")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use" }));
    expect(screen.getByLabelText("Command")).toHaveValue("codex");

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(runtimeMocks.saveDesktopAgentConfig).toHaveBeenCalledWith("codex");
    });
    expect(useAppStore.getState().toast).toBe("Agent command saved");
    expect(useAppStore.getState().agentSettingsOpen).toBe(false);
  });

  it("tests the configured command", async () => {
    const user = userEvent.setup();

    render(<AgentSettingsDialog />);

    await user.click(await screen.findByRole("button", { name: "Use" }));
    await user.click(screen.getByRole("button", { name: "Test" }));

    await waitFor(() => {
      expect(runtimeMocks.testDesktopAgentCommand).toHaveBeenCalledWith(
        "codex",
      );
    });
    expect(
      screen.getByText(/Command responded to --version/),
    ).toBeInTheDocument();
  });
});
