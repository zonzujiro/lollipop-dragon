import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TabBar } from "./index";
import { resetTestStore, setTestState } from "../../../testing/testHelpers";

beforeEach(() => {
  resetTestStore();
});

describe("TabBar", () => {
  it("does not render a + button", () => {
    setTestState({ label: "test", fileName: "test.md" });
    render(<TabBar />);
    expect(
      screen.queryByRole("button", { name: "Open new tab" }),
    ).not.toBeInTheDocument();
  });

  it("still renders tab buttons", () => {
    setTestState({ label: "test", fileName: "test.md" });
    render(<TabBar />);
    expect(screen.getByRole("tab")).toBeInTheDocument();
  });
});
