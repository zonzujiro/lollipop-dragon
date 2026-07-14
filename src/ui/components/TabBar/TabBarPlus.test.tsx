import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TabBar } from "./index";
import { resetTestStore, setTestState } from "../../../testing/testHelpers";

beforeEach(() => {
  resetTestStore();
});

describe("TabBar", () => {
  it("renders the single designed add-tab control", () => {
    setTestState({ label: "test", fileName: "test.md" });
    render(<TabBar />);
    expect(
      screen.getByRole("button", { name: "Open file in new tab" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open folder in new tab" }),
    ).not.toBeInTheDocument();
  });

  it("still renders tab buttons", () => {
    setTestState({ label: "test", fileName: "test.md" });
    render(<TabBar />);
    expect(screen.getByRole("tab")).toBeInTheDocument();
  });

  it("shows a file icon for a single-file workspace", () => {
    setTestState({ label: "test", fileName: "test.md" });
    render(<TabBar />);

    expect(
      screen.getByRole("tab").querySelector('[data-kind="file"]'),
    ).toBeInTheDocument();
  });

  it("shows a folder icon for a folder workspace", () => {
    setTestState({
      label: "docs",
      directoryName: "docs",
      fileName: "readme.md",
    });
    render(<TabBar />);

    expect(
      screen.getByRole("tab").querySelector('[data-kind="folder"]'),
    ).toBeInTheDocument();
  });

  it("shows the open comment count", () => {
    setTestState({
      label: "test",
      fileName: "test.md",
      comments: [
        {
          id: "comment-1",
          criticType: "comment",
          type: "fix",
          text: "Fix this",
          raw: "{>>fix: Fix this<<}",
          rawStart: 0,
          rawEnd: 20,
          cleanStart: 0,
          cleanEnd: 0,
        },
      ],
    });
    render(<TabBar />);
    expect(screen.getByLabelText("1 open comments")).toHaveTextContent("1");
  });
});
