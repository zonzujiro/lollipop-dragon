import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownRenderer } from "./index";
import { useAppStore } from "../../../store";
import { setTestState, resetTestStore } from "../../../testing/testHelpers";

function setContent(raw: string) {
  setTestState({ rawContent: raw });
}

beforeEach(() => {
  resetTestStore();
  setTestState({
    fileHandle: null,
    fileName: null,
    rawContent: "",
    comments: [],
    writeAllowed: true,
  });
  useAppStore.setState({ reopenTab: vi.fn() });
});

describe("MarkdownRenderer — CommonMark", () => {
  it("keeps the active file title visible above the document", () => {
    setTestState({
      fileName: "overview.md",
      activeFilePath: "database/overview.md",
      rawContent: "# Overview",
    });

    render(<MarkdownRenderer />);

    expect(screen.getByText("database/overview.md")).toHaveClass(
      "document-outline__path",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Overview" }),
    ).toBeInTheDocument();
  });

  it("renders headings h1–h3", () => {
    setContent("# H1\n## H2\n### H3");
    render(<MarkdownRenderer />);
    expect(
      screen.getByRole("heading", { level: 1, name: "H1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "H2" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "H3" }),
    ).toBeInTheDocument();
  });

  it("renders headings h4–h6", () => {
    setContent("#### H4\n##### H5\n###### H6");
    render(<MarkdownRenderer />);
    expect(
      screen.getByRole("heading", { level: 4, name: "H4" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 5, name: "H5" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 6, name: "H6" }),
    ).toBeInTheDocument();
  });

  it("renders paragraphs", () => {
    setContent("First paragraph.\n\nSecond paragraph.");
    render(<MarkdownRenderer />);
    expect(screen.getByText("First paragraph.")).toBeInTheDocument();
    expect(screen.getByText("Second paragraph.")).toBeInTheDocument();
  });

  it("renders bold and italic", () => {
    setContent("**bold** and *italic*");
    render(<MarkdownRenderer />);
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
  });

  it("renders inline code", () => {
    setContent("Use `console.log()` for debugging.");
    render(<MarkdownRenderer />);
    expect(screen.getByText("console.log()")).toBeInTheDocument();
  });

  it("renders fenced code blocks", () => {
    setContent("```js\nconst x = 1\n```");
    render(<MarkdownRenderer />);
    expect(screen.getByText("const x = 1")).toBeInTheDocument();
  });

  it("renders blockquotes", () => {
    setContent("> This is a quote.");
    render(<MarkdownRenderer />);
    expect(screen.getByText("This is a quote.")).toBeInTheDocument();
  });

  it("renders links", () => {
    setContent("[Click here](https://example.com)");
    render(<MarkdownRenderer />);
    const link = screen.getByRole("link", { name: "Click here" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("renders unordered lists", () => {
    setContent("- Apple\n- Banana\n- Cherry");
    render(<MarkdownRenderer />);
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("Cherry")).toBeInTheDocument();
  });

  it("renders ordered lists", () => {
    setContent("1. First\n2. Second\n3. Third");
    render(<MarkdownRenderer />);
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("First")).toBeInTheDocument();
  });

  it("renders nested lists", () => {
    setContent("- Top\n  - Nested A\n  - Nested B\n- Bottom");
    render(<MarkdownRenderer />);
    const lists = screen.getAllByRole("list");
    expect(lists.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Nested A")).toBeInTheDocument();
    expect(screen.getByText("Nested B")).toBeInTheDocument();
  });

  it("renders horizontal rules", () => {
    setContent("Above\n\n---\n\nBelow");
    const { container } = render(<MarkdownRenderer />);
    expect(container.querySelector("hr")).toBeInTheDocument();
  });

  it("renders images", () => {
    setContent("![Alt text](https://example.com/image.png)");
    const { container } = render(<MarkdownRenderer />);
    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("alt", "Alt text");
    expect(img).toHaveAttribute("src", "https://example.com/image.png");
  });
});

describe("MarkdownRenderer — commenting", () => {
  it("opens a whole-line composer from a code gutter without polluting code text", async () => {
    setContent("```ts\nconst first = 1;\nconst second = 2;\n```");
    const { container } = render(<MarkdownRenderer />);

    const code = container.querySelector("code[data-anchor-root]");
    expect(code?.textContent).toBe("const first = 1;\nconst second = 2;\n");
    expect(container.querySelector(".code-comment-surface")?.textContent).toBe(
      "const first = 1;\nconst second = 2;\n",
    );

    fireEvent.click(screen.getByRole("button", { name: "Comment on line 2" }));

    expect(await screen.findByText("“const second = 2;”")).toBeInTheDocument();
  });

  it("carries the same whole-line code anchor in peer mode", async () => {
    resetTestStore();
    setTestState(
      {},
      {
        isPeerMode: true,
        peerName: "Marta",
        peerRawContent: "```js\nrepeat();\nrepeat();\n```",
        peerFileName: "sample.md",
        peerActiveFilePath: "sample.md",
        sharedContent: {
          version: "2.0",
          created_at: new Date().toISOString(),
          tree: { "sample.md": "```js\nrepeat();\nrepeat();\n```" },
        },
      },
    );
    render(<MarkdownRenderer />);

    fireEvent.click(screen.getByRole("button", { name: "Comment on line 2" }));
    await userEvent.type(
      await screen.findByLabelText("Comment text"),
      "Check the repeated call.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(useAppStore.getState().myPeerComments[0]?.blockRef).toMatchObject({
      blockIndex: 0,
      anchorVersion: 1,
      quote: "repeat();",
      occurrence: 2,
    });
  });

  it("keeps the range composer open through the click emitted after selection", async () => {
    setContent("Select this exact phrase for review.");
    render(<MarkdownRenderer />);
    const paragraph = screen.getByText("Select this exact phrase for review.");
    const textNode = paragraph.firstChild;
    if (!textNode) {
      throw new Error("Expected the paragraph to contain a text node");
    }

    const range = document.createRange();
    range.setStart(textNode, 7);
    range.setEnd(textNode, 24);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.mouseUp(paragraph);
    expect(await screen.findByText("“this exact phrase”")).toBeInTheDocument();

    fireEvent.click(paragraph);

    expect(screen.getByText("“this exact phrase”")).toBeInTheDocument();
    expect(screen.getByLabelText("Comment text")).toBeInTheDocument();

    fireEvent.click(document.body);
    expect(screen.queryByLabelText("Comment text")).not.toBeInTheDocument();
  });
});

describe("MarkdownRenderer — responsive reading width", () => {
  it("uses most of the reading pane while preserving the comment lane", () => {
    const markdownRendererCss = readFileSync(
      "src/ui/components/MarkdownRenderer/MarkdownRenderer.css",
      "utf8",
    );
    expect(markdownRendererCss).toContain("--document-body-width: 1450px");
    expect(markdownRendererCss).toContain("--document-viewer-width: 1498px");
    expect(markdownRendererCss).toContain(
      "width: min(90%, var(--document-viewer-width))",
    );
    expect(markdownRendererCss).toContain(
      "width: min(calc(90% - 3rem), var(--document-body-width))",
    );
  });
});

describe("MarkdownRenderer — GFM extras", () => {
  it("renders GFM tables", () => {
    setContent("| Name | Age |\n|------|-----|\n| Alice | 30 |\n| Bob | 25 |");
    render(<MarkdownRenderer />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("renders task lists", () => {
    setContent("- [x] Done\n- [ ] Not done");
    render(<MarkdownRenderer />);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it("renders strikethrough", () => {
    setContent("~~deleted text~~");
    render(<MarkdownRenderer />);
    const el = screen.getByText("deleted text");
    expect(el.tagName).toBe("DEL");
  });

  it("renders footnotes", () => {
    setContent("Text with a note[^1].\n\n[^1]: Footnote content here.");
    const { container } = render(<MarkdownRenderer />);
    expect(container.querySelector("sup")).toBeInTheDocument();
    expect(screen.getByText("Footnote content here.")).toBeInTheDocument();
  });
});

describe("MarkdownRenderer — metadata", () => {
  it("renders frontmatter as a metadata panel and removes it from the body", () => {
    setContent(
      [
        "---",
        "id: DEC-retrieval-fast-paths-use-generated-metadata",
        "date: 11/06/2026",
        "status: Proposed",
        "summary: Fast-path retrieval should not require broad document reads.",
        "participants:",
        "  - Ivan Tytarenko",
        "  - Codex",
        "extends: [decision-records-carry-summary, agent-quality-gates]",
        "---",
        "# Decision: Retrieval Fast Paths",
      ].join("\n"),
    );

    const { container } = render(<MarkdownRenderer />);

    expect(
      screen.getByRole("region", { name: "Metadata" }),
    ).toBeInTheDocument();
    expect(screen.getByText("id")).toBeInTheDocument();
    expect(
      screen.getByText("DEC-retrieval-fast-paths-use-generated-metadata"),
    ).toBeInTheDocument();
    expect(screen.getByText("Ivan Tytarenko")).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Decision: Retrieval Fast Paths",
      }),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".markdown-body")?.textContent,
    ).not.toContain("participants:");
  });
});

describe("MarkdownRenderer — read-only banner", () => {
  it("does not show the banner when writeAllowed is true", () => {
    setTestState({ writeAllowed: true });
    setContent("Hello.");
    render(<MarkdownRenderer />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the read-only banner when writeAllowed is false", () => {
    setTestState({ writeAllowed: false });
    setContent("Hello.");
    render(<MarkdownRenderer />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("status").textContent).toMatch(/read-only/i);
  });

  it("shows a restore banner instead of the generic read-only banner when access must be reopened", () => {
    const reopenTab = vi.fn();
    useAppStore.setState({ reopenTab });
    setTestState({
      fileName: "draft.md",
      rawContent: "Hello.",
      writeAllowed: false,
      restoreError:
        'Live access to "draft.md" is unavailable. Open the file again.',
    });

    render(<MarkdownRenderer />);

    expect(screen.getByRole("status").textContent).toMatch(/live access/i);
    expect(
      screen.getByRole("button", { name: "Restore access" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open another file…" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status").textContent).not.toMatch(/read-only/i);
  });
});

describe("MarkdownRenderer — GFM footnotes", () => {
  it("renders footnote refs and the trailing section on aligned block indices", () => {
    setContent("Uses a note.[^a]\n\nSecond paragraph.\n\n[^a]: The note body.");
    render(<MarkdownRenderer />);
    expect(screen.getByText("The note body.")).toBeInTheDocument();
    const reference = document.querySelector("[data-footnote-ref]");
    expect(reference).not.toBeNull();
    const section = document.querySelector("[data-footnotes]");
    expect(section).not.toBeNull();
    // two rendered paragraphs (0, 1), then the footnotes section (2) — the
    // definition itself must not shift rendered block indices
    expect(section?.getAttribute("data-block-index")).toBe("2");
  });
});

describe("MarkdownRenderer — margin markers", () => {
  it("renders a margin square for block-level and range comments", async () => {
    setContent(
      'Alpha paragraph body.{>>question: Why is this so?<<}\n\nBeta paragraph body. {>>clarify: Tighten this. @@ "Beta paragraph body."<<}',
    );
    const { container } = render(<MarkdownRenderer />);
    await waitFor(() => {
      expect(container.querySelectorAll(".comment-margin__dot").length).toBe(2);
    });
  });
});

describe("MarkdownRenderer — hover spotlight", () => {
  it("focuses the hovered comment's spans and mutes every other highlight", async () => {
    setContent(
      'Alpha beta gamma delta. {>>clarify: First. @@ "Alpha beta gamma"<<} {>>rewrite: Second. @@ "beta gamma delta"<<}',
    );
    const { container } = render(<MarkdownRenderer />);
    await waitFor(() => {
      expect(
        container.querySelectorAll(".comment-highlight").length,
      ).toBeGreaterThanOrEqual(3);
    });
    const spans = [
      ...container.querySelectorAll<HTMLElement>(".comment-highlight"),
    ];
    const soloSpan = spans.find(
      (span) => (span.dataset.cids ?? "").split(" ").length === 1,
    );
    if (!soloSpan) {
      throw new Error("Expected a span covered by a single comment");
    }
    const hoveredId = soloSpan.dataset.cids ?? "";

    act(() => {
      useAppStore.getState().setHoveredBlockHighlight({
        blockIndex: 0,
        commentType: "clarify",
        commentId: hoveredId,
      });
    });

    const sharedSpan = spans.find(
      (span) => (span.dataset.cids ?? "").split(" ").length > 1,
    );
    if (!sharedSpan) {
      throw new Error("Expected a span shared by two comments");
    }

    for (const span of spans) {
      const covers = (span.dataset.cids ?? "").split(" ").includes(hoveredId);
      expect(span.classList.contains("comment-highlight--focus")).toBe(covers);
      expect(span.classList.contains("comment-highlight--muted")).toBe(!covers);
    }
    // while spotlit, the shared segment renders only the hovered comment's
    // stripe (the stacked styles are parked on the dataset for restore)
    expect(sharedSpan.dataset.spotlightShadow).toBeDefined();
    expect(sharedSpan.style.boxShadow).toBe("inset 0 -2px 0 var(--c-clarify)");

    act(() => {
      useAppStore.getState().setHoveredBlockHighlight(null);
    });
    for (const span of spans) {
      expect(span.classList.contains("comment-highlight--focus")).toBe(false);
      expect(span.classList.contains("comment-highlight--muted")).toBe(false);
    }
    // stacked styles restored after unhover
    expect(sharedSpan.dataset.spotlightShadow).toBeUndefined();
  });
});
