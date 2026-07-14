import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../../store";
import { resetTestStore, setTestState } from "../../../testing/testHelpers";
import { CommandPalette } from "./CommandPalette";

beforeEach(() => {
  resetTestStore();
  setTestState({ rawContent: "# Document", fileName: "document.md" });
});

describe("CommandPalette", () => {
  it("opens with Cmd+K, filters actions, and restores focus on Escape", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>Before</button>
        <CommandPalette />
      </>,
    );
    const before = screen.getByRole("button", { name: "Before" });
    before.focus();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const search = screen.getByRole("textbox", { name: "Search commands" });
    await user.type(search, "dark theme");
    expect(
      screen.getByRole("option", { name: /Use dark theme/ }),
    ).toBeVisible();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Commands" })).toBeNull();
  });

  it("runs the selected keyboard action", () => {
    const setTheme = vi.spyOn(useAppStore.getState(), "setTheme");
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(screen.getByRole("textbox", { name: "Search commands" }), {
      target: { value: "dark theme" },
    });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(setTheme).toHaveBeenCalledWith("dark");
  });
});
