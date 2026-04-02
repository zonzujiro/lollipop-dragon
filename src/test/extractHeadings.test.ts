import { describe, expect, it } from "vitest";
import { extractHeadings } from "../utils/extractHeadings";

describe("extractHeadings", () => {
  it("extracts headings with correct levels and block indices", () => {
    const md = "# Title\n\nSome text.\n\n## Section\n\nMore text.\n\n### Sub";
    const result = extractHeadings(md);
    expect(result).toEqual([
      { level: 1, text: "Title", blockIndex: 0 },
      { level: 2, text: "Section", blockIndex: 2 },
      { level: 3, text: "Sub", blockIndex: 4 },
    ]);
  });

  it("returns empty array for content with no headings", () => {
    expect(extractHeadings("Just a paragraph.")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(extractHeadings("")).toEqual([]);
  });

  it("handles all six heading levels", () => {
    const md = "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6";
    const result = extractHeadings(md);
    expect(result.map((h) => h.level)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("does not extract headings inside fenced code blocks", () => {
    const md = "# Real heading\n\n```\n# Not a heading\n```\n\n## Another real";
    const result = extractHeadings(md);
    expect(result).toEqual([
      { level: 1, text: "Real heading", blockIndex: 0 },
      { level: 2, text: "Another real", blockIndex: 2 },
    ]);
  });

  it("extracts inline content (bold, code, links) as plain text", () => {
    const md = "# Hello **world** and `code`";
    const result = extractHeadings(md);
    expect(result[0].text).toBe("Hello world and code");
  });
});
