import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import type { HistoryEntry } from "../../../types/history";
import { resetTestStore, setTestState } from "../../../testing/testHelpers";
import { HistoryDropdown } from "./index";

const historyEntry: HistoryEntry = {
  id: "history-entry",
  type: "file",
  name: "proposal.md",
  stableKey: "proposal.md",
  closedAt: "2026-07-09T12:00:00.000Z",
  activeFilePath: null,
  hasActiveShares: false,
};

beforeEach(() => {
  resetTestStore();
});

describe("HistoryDropdown", () => {
  it("renders the open menu outside the scrolling header actions", async () => {
    const user = userEvent.setup();
    setTestState({}, { history: [historyEntry] });

    const { container } = render(
      <div className="app-header__actions">
        <HistoryDropdown />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Recent files" }));

    const menu = screen.getByText("Recent").closest(".history-dropdown__menu");
    expect(menu).toBeInTheDocument();
    expect(menu?.parentElement).toBe(document.body);
    expect(container.querySelector(".history-dropdown__menu")).toBeNull();
  });
});
