import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentOutline } from "./DocumentOutline";
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

describe("DocumentOutline", () => {
  it("shows the path and the current section in the sticky bar", () => {
    render(
      <DocumentOutline
        path="database/comparison.md"
        cleanMarkdown={MARKDOWN}
        comments={[]}
      />,
    );
    expect(screen.getByText("database/comparison.md")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Table of contents" }),
    ).toHaveTextContent("Alpha");
  });

  it("lists sections with their open-comment counts", () => {
    render(
      <DocumentOutline
        path="doc.md"
        cleanMarkdown={MARKDOWN}
        comments={[
          makeComment("c1", 3), // paragraph inside Beta
          makeComment("c2", 5), // paragraph inside Gamma
          makeComment("c3", 5),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Table of contents" }));
    const entries = screen.getAllByRole("menuitem");
    expect(entries.map((entry) => entry.textContent)).toEqual([
      "Alpha",
      "Beta1",
      "Gamma2",
    ]);
  });

  it("jumps to the section block and closes on selection", () => {
    const block = document.createElement("div");
    block.setAttribute("data-block-index", "2");
    document.body.appendChild(block);
    const scrollSpy = vi.fn();
    block.scrollIntoView = scrollSpy;

    render(
      <DocumentOutline path="doc.md" cleanMarkdown={MARKDOWN} comments={[]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Table of contents" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Beta" }));

    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    block.remove();
  });

  it("shows only the path when the document has no headings", () => {
    render(
      <DocumentOutline
        path="notes.md"
        cleanMarkdown="Just a paragraph."
        comments={[]}
      />,
    );
    expect(screen.getByText("notes.md")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Table of contents" }),
    ).not.toBeInTheDocument();
  });
});
