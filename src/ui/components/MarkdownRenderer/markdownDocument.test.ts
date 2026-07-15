import { describe, expect, it } from "vitest";
import type { PeerComment } from "../../../types/share";
import {
  buildPeerRangeComments,
  getMarkdownContentKey,
  parseMarkdownDocument,
} from "./markdownDocument";

describe("markdownDocument", () => {
  it("separates metadata and shifts comment offsets back to the source", () => {
    const rawContent = [
      "---",
      "owner: Ivan",
      "tags: [architecture, frontend]",
      "---",
      "# Title",
      "",
      "Read {==this==}{>>fix: Clarify this.<<}.",
    ].join("\n");

    const document = parseMarkdownDocument(rawContent);

    expect(document.metadata).toEqual([
      { key: "owner", values: ["Ivan"], multiline: false },
      {
        key: "tags",
        values: ["architecture", "frontend"],
        multiline: true,
      },
    ]);
    expect(document.cleanMarkdown).toBe("# Title\n\nRead this.");
    expect(document.comments).toHaveLength(1);
    expect(document.comments[0]).toMatchObject({
      text: "Clarify this.",
      rawStart: rawContent.indexOf("{==this==}"),
      blockIndex: 1,
    });
  });

  it("maps matching peer range comments and ignores comments for other files", () => {
    const comments: PeerComment[] = [
      {
        id: "c_matching",
        peerName: "Alex",
        path: "docs/review.md",
        blockRef: {
          blockIndex: 1,
          contentPreview: "First target, second target.",
          quote: "target",
          occurrence: 2,
        },
        commentType: "fix",
        text: "Clarify the second target.",
        createdAt: "2026-07-15T12:00:00.000Z",
      },
      {
        id: "c_other_file",
        peerName: "Sam",
        path: "docs/other.md",
        blockRef: {
          blockIndex: 1,
          contentPreview: "First target, second target.",
          quote: "target",
        },
        commentType: "question",
        text: "Is this relevant?",
        createdAt: "2026-07-15T12:01:00.000Z",
      },
    ];

    const mapped = buildPeerRangeComments({
      comments,
      activeFilePath: "docs/review.md",
      cleanMarkdown: "# Review\n\nFirst target, second target.",
    });

    expect(mapped).toHaveLength(1);
    expect(mapped[0]).toMatchObject({
      id: "c_matching",
      blockIndex: 1,
      anchor: { quote: "target", occurrence: 2, orphaned: false },
      thread: { authorLabel: "Alex" },
    });
  });

  it("changes the render key with document identity or content", () => {
    const first = getMarkdownContentKey({
      activeFilePath: "docs/first.md",
      fileName: "first.md",
      cleanMarkdown: "# Same",
    });
    const second = getMarkdownContentKey({
      activeFilePath: "docs/second.md",
      fileName: "second.md",
      cleanMarkdown: "# Same",
    });
    const changed = getMarkdownContentKey({
      activeFilePath: "docs/first.md",
      fileName: "first.md",
      cleanMarkdown: "# Changed",
    });

    expect(first).not.toBe(second);
    expect(first).not.toBe(changed);
  });
});
