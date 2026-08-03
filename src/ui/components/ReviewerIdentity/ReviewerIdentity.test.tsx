import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../../../store";
import { resetTestStore } from "../../../testing/testHelpers";
import { ReviewerIdentity } from "./ReviewerIdentity";

describe("ReviewerIdentity", () => {
  beforeEach(() => {
    resetTestStore();
    useAppStore.setState({ peerName: "Ivan T." });
  });

  it("opens a focused input prefilled with the current name", async () => {
    const user = userEvent.setup();
    render(<ReviewerIdentity sharedFileCount={1} />);

    await user.click(
      screen.getByRole("button", { name: /change reviewer name/i }),
    );

    const input = screen.getByRole("textbox", { name: "Reviewer name" });
    expect(input).toHaveValue("Ivan T.");
    expect(input).toHaveFocus();
  });

  it("trims and saves the name with Enter", async () => {
    const user = userEvent.setup();
    render(<ReviewerIdentity sharedFileCount={1} />);

    await user.click(
      screen.getByRole("button", { name: /change reviewer name/i }),
    );
    const input = screen.getByRole("textbox", { name: "Reviewer name" });
    await user.clear(input);
    await user.type(input, "  Ivan Tester  {Enter}");

    expect(useAppStore.getState().peerName).toBe("Ivan Tester");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /currently Ivan Tester/i }),
    ).toHaveFocus();
  });

  it("does not allow an empty reviewer name", async () => {
    const user = userEvent.setup();
    render(<ReviewerIdentity sharedFileCount={1} />);

    await user.click(
      screen.getByRole("button", { name: /change reviewer name/i }),
    );
    await user.clear(screen.getByRole("textbox", { name: "Reviewer name" }));

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("cancels with Escape and preserves the current name", async () => {
    const user = userEvent.setup();
    render(<ReviewerIdentity sharedFileCount={1} />);
    const identityButton = screen.getByRole("button", {
      name: /change reviewer name/i,
    });

    await user.click(identityButton);
    await user.clear(screen.getByRole("textbox", { name: "Reviewer name" }));
    await user.type(
      screen.getByRole("textbox", { name: "Reviewer name" }),
      "Different name",
    );
    await user.keyboard("{Escape}");

    expect(useAppStore.getState().peerName).toBe("Ivan T.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(identityButton).toHaveFocus();
  });

  it("dismisses when clicking outside", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ReviewerIdentity sharedFileCount={1} />
        <button type="button">Outside</button>
      </div>,
    );

    await user.click(
      screen.getByRole("button", { name: /change reviewer name/i }),
    );
    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(useAppStore.getState().peerName).toBe("Ivan T.");
  });
});
