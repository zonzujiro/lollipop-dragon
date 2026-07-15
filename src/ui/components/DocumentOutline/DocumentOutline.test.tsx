import { createRef } from "react";
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

function renderOutline(comments: Comment[] = [], markdown = MARKDOWN) {
  const scrollRootRef = createRef<HTMLDivElement>();
  return render(
    <div ref={scrollRootRef}>
      <DocumentOutline
        cleanMarkdown={markdown}
        comments={comments}
        scrollRootRef={scrollRootRef}
      />
    </div>,
  );
}

describe("DocumentOutline — edge minimap", () => {
  it("always renders one tick per heading", () => {
    const { container } = renderOutline();
    expect(container.querySelectorAll(".document-outline__tick").length).toBe(
      3,
    );
    expect(
      screen.getByRole("button", { name: "Table of contents" }),
    ).toBeInTheDocument();
  });

  it("expands on hover into the contents panel with comment counts", () => {
    const { container } = renderOutline([
      makeComment("c1", 3), // inside Beta
      makeComment("c2", 5), // inside Gamma
      makeComment("c3", 5),
    ]);
    const outlineRoot = container.querySelector(".document-outline");
    if (!outlineRoot) {
      throw new Error("Expected the outline root");
    }
    fireEvent.mouseEnter(outlineRoot);
    expect(
      screen.getAllByRole("menuitem").map((entry) => entry.textContent),
    ).toEqual(["Alpha", "Beta1", "Gamma2"]);
  });

  it("jumps to the section block and collapses on selection", () => {
    const { container } = renderOutline();
    const scrollRoot = container.firstChild;
    if (!(scrollRoot instanceof HTMLElement)) {
      throw new Error("Expected the scroll root element");
    }
    const block = document.createElement("div");
    block.setAttribute("data-block-index", "2");
    scrollRoot.appendChild(block);
    const scrollSpy = vi.fn();
    block.scrollIntoView = scrollSpy;

    fireEvent.click(screen.getByRole("button", { name: "Table of contents" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Beta" }));

    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("caps the map to top-level headings when the document is very long", () => {
    const long = Array.from({ length: 24 }, (_, index) =>
      index % 2 === 0
        ? `## Section ${index}\n\nBody.`
        : `### Sub ${index}\n\nBody.`,
    ).join("\n\n");
    const { container } = renderOutline([], `# Title\n\n${long}`);
    const ticks = container.querySelectorAll(".document-outline__tick");
    // 1 title + 12 level-2 sections; the 12 level-3 subsections are dropped
    expect(ticks.length).toBe(13);
  });

  it("renders nothing for documents without headings", () => {
    const { container } = renderOutline([], "Just a paragraph.");
    expect(container.querySelector(".document-outline")).toBeNull();
  });
});
