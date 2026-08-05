import { afterAll, describe, expect, it } from "vitest";
import { createApplicationHighlighter } from "./createShikiHighlighter";

const highlighter = await createApplicationHighlighter();

afterAll(() => {
  highlighter.dispose();
});

describe("createApplicationHighlighter", () => {
  it("emits paired light and dark token colors", () => {
    const highlightedTree = highlighter.codeToHast("const value = 1", {
      lang: "typescript",
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
    });

    expect(JSON.stringify(highlightedTree)).toContain("--shiki-dark");
  });
});
