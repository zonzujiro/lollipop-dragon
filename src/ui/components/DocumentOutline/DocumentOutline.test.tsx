import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentOutline } from "./DocumentOutline";
import { resetTestStore, setTestState } from "../../../testing/testHelpers";
import type { Comment } from "../../../types/criticmarkup";

const MARKDOWN = [
  "# Alpha",
  "",
  "Intro paragraph.",
  "",
  "## Beta",
  "",
  "Body paragraph.",
  "",
  "## Gamma",
  "",
  "Closing paragraph.",
].join("\n");

function makeComment(id: string, blockIndex: number): Comment {
  return {
    id,
    type: "question",
    text: "why?",
    rawStart: 0,
    rawEnd: 0,
    cleanStart: 0,
    cleanEnd: 0,
    raw: "",
    criticType: "comment",
    blockIndex,
  };
}

beforeEach(() => {
  resetTestStore();
});

describe("DocumentOutline", () => {
  it("opens the contents panel from the header trigger", () => {
    setTestState({ fileName: "doc.md", rawContent: MARKDOWN });
    render(<DocumentOutline />);
    fireEvent.click(screen.getByRole("button", { name: "Table of contents" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(
      screen.getAllByRole("menuitem").map((entry) => entry.textContent),
    ).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("shows per-section open-comment counts", () => {
    setTestState({
      fileName: "doc.md",
      rawContent: MARKDOWN,
      comments: [
        makeComment("c1", 3), // inside Beta
        makeComment("c2", 5), // inside Gamma
        makeComment("c3", 5),
      ],
    });
    render(<DocumentOutline />);
    fireEvent.click(screen.getByRole("button", { name: "Table of contents" }));
    expect(
      screen.getAllByRole("menuitem").map((entry) => entry.textContent),
    ).toEqual(["Alpha", "Beta1", "Gamma2"]);
  });

  it("jumps to the section block and closes on selection", () => {
    setTestState({ fileName: "doc.md", rawContent: MARKDOWN });
    const block = document.createElement("div");
    block.setAttribute("data-block-index", "2");
    document.body.appendChild(block);
    const scrollSpy = vi.fn();
    block.scrollIntoView = scrollSpy;

    render(<DocumentOutline />);
    fireEvent.click(screen.getByRole("button", { name: "Table of contents" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Beta" }));

    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    block.remove();
  });

  it("is disabled when the document has no headings", () => {
    setTestState({ fileName: "notes.md", rawContent: "Just a paragraph." });
    render(<DocumentOutline />);
    expect(
      screen.getByRole("button", { name: "Table of contents" }),
    ).toBeDisabled();
  });
});
