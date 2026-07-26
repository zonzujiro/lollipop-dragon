import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBlockPlainTextMap,
  insertComment,
  parseCriticMarkup,
} from "../../../markup";
import { useAppStore } from "../../../store";
import { resetTestStore, setTestState } from "../../../testing/testHelpers";
import { MarkdownRenderer } from "./index";

function setContent(rawContent: string): void {
  setTestState({ rawContent });
}

function selectText(element: HTMLElement, start: number, end: number): void {
  const textNode = element.firstChild;
  if (!(textNode instanceof Text)) {
    throw new Error("Expected a text node");
  }
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

beforeEach(() => {
  resetTestStore();
  setTestState({
    fileHandle: null,
    fileName: "alerts.md",
    activeFilePath: "alerts.md",
    rawContent: "",
    comments: [],
    writeAllowed: true,
  });
});

describe("MarkdownRenderer — GitHub alerts", () => {
  it("renders all five exact alert types with accessible app labels", () => {
    setContent(
      [
        "> [!NOTE]\n> Note body.",
        "> [!TIP]\n> Tip body.",
        "> [!IMPORTANT]\n> Important body.",
        "> [!WARNING]\n> Warning body.",
        "> [!CAUTION]\n> Caution body.",
      ].join("\n\n"),
    );

    const { container } = render(<MarkdownRenderer />);
    const alerts = container.querySelectorAll<HTMLElement>(
      "blockquote[data-markdown-alert]",
    );

    expect([...alerts].map((alert) => alert.dataset.markdownAlert)).toEqual([
      "note",
      "tip",
      "important",
      "warning",
      "caution",
    ]);
    expect(
      [...alerts].map((alert) => alert.getAttribute("aria-label")),
    ).toEqual([
      "Note alert",
      "Tip alert",
      "Important alert",
      "Warning alert",
      "Caution alert",
    ]);
    expect(
      [...alerts].every((alert) => alert.getAttribute("role") === "note"),
    ).toBe(true);
    expect(
      container.querySelector(".markdown-content")?.textContent,
    ).not.toContain("[!NOTE]");
  });

  it("preserves rich Markdown inside an alert", () => {
    setContent(
      [
        "> [!NOTE]",
        ">",
        "> Use **strong guidance** and [the reference](https://example.com).",
        ">",
        "> - First item",
        "> - Second item",
      ].join("\n"),
    );

    const { container } = render(<MarkdownRenderer />);
    const alert = container.querySelector(
      'blockquote[data-markdown-alert="note"]',
    );

    expect(alert).toBeInTheDocument();
    expect(screen.getByText("strong guidance").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "the reference" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    expect(alert?.querySelectorAll("li")).toHaveLength(2);
  });

  it("leaves malformed, lowercase, unknown, and nested markers as blockquotes", () => {
    setContent(
      [
        "> [!note]\n> Lowercase.",
        "> [!UNKNOWN]\n> Unknown.",
        "> [!NOTE] Same line.",
        "> [!TIP]**Not a marker line.**",
        "- List item\n  > [!WARNING]\n  > Nested.",
      ].join("\n\n"),
    );

    const { container } = render(<MarkdownRenderer />);

    expect(
      container.querySelector("blockquote[data-markdown-alert]"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/^\[!note\]/)).toBeInTheDocument();
    expect(screen.getByText(/^\[!UNKNOWN\]/)).toBeInTheDocument();
    expect(screen.getByText("[!NOTE] Same line.")).toBeInTheDocument();
    expect(screen.getByText("[!TIP]")).toBeInTheDocument();
    expect(screen.getByText(/^\[!WARNING\]/)).toBeInTheDocument();
  });

  it("keeps raw HTML inert inside alerts", () => {
    setContent(
      [
        "> [!CAUTION]",
        "> Safe content.",
        "> <script>window.alert('unsafe')</script>",
        '> <img src="https://tracker.example/pixel" onerror="alert(1)">',
      ].join("\n"),
    );

    const { container } = render(<MarkdownRenderer />);

    expect(
      container.querySelector('blockquote[data-markdown-alert="caution"]'),
    ).toBeInTheDocument();
    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("uses the same alert rendering in peer mode", () => {
    resetTestStore();
    setTestState(
      {},
      {
        isPeerMode: true,
        peerName: "Marta",
        peerRawContent: "> [!TIP]\n> Shared guidance.",
        peerFileName: "shared.md",
        peerActiveFilePath: "shared.md",
        sharedContent: {
          version: "2.0",
          created_at: new Date().toISOString(),
          tree: { "shared.md": "> [!TIP]\n> Shared guidance." },
        },
      },
    );

    const { container } = render(<MarkdownRenderer />);

    expect(
      container.querySelector('blockquote[data-markdown-alert="tip"]'),
    ).toHaveTextContent("Shared guidance.");
  });

  it("excludes the alert marker from range-comment anchors", async () => {
    const user = userEvent.setup();
    const addComment = vi.fn();
    useAppStore.setState({ addComment });
    setContent("> [!IMPORTANT]\n> Select this alert phrase.");
    render(<MarkdownRenderer />);
    const paragraph = screen.getByText("Select this alert phrase.");
    const selectedText = "Select this alert phrase";
    selectText(paragraph, 0, selectedText.length);

    fireEvent.mouseUp(paragraph);
    const commentAction = await screen.findByRole("button", {
      name: "Comment",
    });
    fireEvent.mouseDown(commentAction);
    fireEvent.click(commentAction);
    await user.type(screen.getByLabelText("Comment text"), "Review this.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(addComment).toHaveBeenCalledWith(0, "question", "Review this.", {
      quote: selectedText,
      occurrence: 1,
      start: 0,
      end: selectedText.length,
    });
    expect(
      getBlockPlainTextMap("> [!IMPORTANT]\n> Select this alert phrase.", 0)
        ?.plainText,
    ).toBe("Select this alert phrase.");
  });

  it("renders block and range comments on alert content", async () => {
    setContent(
      "> [!NOTE]\n> Select {==this alert phrase==}{>>clarify: Tighten it.<<}.{>>question: Explain the alert.<<}",
    );
    const { container } = render(<MarkdownRenderer />);

    await waitFor(() => {
      expect(container.querySelectorAll(".comment-margin__dot")).toHaveLength(
        2,
      );
      expect(container.querySelector(".comment-highlight")).toHaveTextContent(
        "this alert phrase",
      );
    });
    expect(
      container.querySelector('blockquote[data-markdown-alert="note"]'),
    ).toHaveAttribute("data-block-index", "0");
  });

  it("writes a range comment around alert body text without touching the marker", () => {
    const rawContent = "> [!NOTE]\n> Select this alert phrase.";
    const parsed = parseCriticMarkup(rawContent);
    const selectedText = "Select this alert phrase";
    const result = insertComment({
      rawContent,
      existingComments: parsed.comments,
      cleanMarkdown: parsed.cleanMarkdown,
      blockIndex: 0,
      type: "clarify",
      text: "Tighten this.",
      anchor: {
        quote: selectedText,
        occurrence: 1,
        start: 0,
        end: selectedText.length,
      },
    });

    expect(result).toBe(
      "> [!NOTE]\n> {==Select this alert phrase==}{>>clarify: Tighten this.<<}.",
    );
  });

  it("posts marker-free range anchors in peer mode", async () => {
    const user = userEvent.setup();
    const rawContent = "> [!WARNING]\n> Shared alert phrase.";
    resetTestStore();
    setTestState(
      {},
      {
        isPeerMode: true,
        peerName: "Marta",
        peerRawContent: rawContent,
        peerFileName: "shared.md",
        peerActiveFilePath: "shared.md",
        sharedContent: {
          version: "2.0",
          created_at: new Date().toISOString(),
          tree: { "shared.md": rawContent },
        },
      },
    );
    render(<MarkdownRenderer />);
    const paragraph = screen.getByText("Shared alert phrase.");
    selectText(paragraph, 0, "Shared alert phrase".length);

    fireEvent.mouseUp(paragraph);
    const commentAction = await screen.findByRole("button", {
      name: "Comment",
    });
    fireEvent.mouseDown(commentAction);
    fireEvent.click(commentAction);
    await user.type(screen.getByLabelText("Comment text"), "Peer review.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(useAppStore.getState().myPeerComments[0]?.blockRef).toMatchObject({
      blockIndex: 0,
      quote: "Shared alert phrase",
      occurrence: 1,
    });
  });
});
