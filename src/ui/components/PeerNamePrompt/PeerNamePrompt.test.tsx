import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PeerNamePrompt } from "./index";
import { useAppStore } from "../../../store";
import { resetTestStore } from "../../../test/testHelpers";

beforeEach(() => {
  resetTestStore();
});

describe("PeerNamePrompt", () => {
  it("renders the name input and submit button", () => {
    render(<PeerNamePrompt />);
    expect(
      screen.getByRole("textbox", { name: "Your name" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start reviewing" }),
    ).toBeInTheDocument();
  });

  it("submit button is disabled when input is empty", () => {
    render(<PeerNamePrompt />);
    expect(
      screen.getByRole("button", { name: "Start reviewing" }),
    ).toBeDisabled();
  });

  it("submit button is disabled for whitespace-only input", async () => {
    const user = userEvent.setup();
    render(<PeerNamePrompt />);
    await user.type(screen.getByRole("textbox", { name: "Your name" }), "   ");
    expect(
      screen.getByRole("button", { name: "Start reviewing" }),
    ).toBeDisabled();
  });

  it("submit button is enabled when name is typed", async () => {
    const user = userEvent.setup();
    render(<PeerNamePrompt />);
    await user.type(
      screen.getByRole("textbox", { name: "Your name" }),
      "Alice",
    );
    expect(
      screen.getByRole("button", { name: "Start reviewing" }),
    ).toBeEnabled();
  });

  it("calls setPeerName with trimmed name on submit", async () => {
    const setPeerName = vi.fn();
    useAppStore.setState({ setPeerName });
    const user = userEvent.setup();
    render(<PeerNamePrompt />);
    await user.type(
      screen.getByRole("textbox", { name: "Your name" }),
      "  Bob  ",
    );
    await user.click(screen.getByRole("button", { name: "Start reviewing" }));
    expect(setPeerName).toHaveBeenCalledWith("Bob");
  });

  it("does not call setPeerName when name is empty", async () => {
    const setPeerName = vi.fn();
    useAppStore.setState({ setPeerName });
    const user = userEvent.setup();
    render(<PeerNamePrompt />);
    await user.type(screen.getByRole("textbox", { name: "Your name" }), "   ");
    await user.keyboard("{Enter}");
    expect(setPeerName).not.toHaveBeenCalled();
  });
});
