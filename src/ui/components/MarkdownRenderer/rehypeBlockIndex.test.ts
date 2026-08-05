import { describe, expect, it } from "vitest";
import { rehypeBlockIndex } from "./rehypeBlockIndex";

describe("rehypeBlockIndex", () => {
  it("indexes a highlighted pre nested in Shiki's root wrapper", () => {
    const paragraph = {
      type: "element",
      properties: {},
    };
    const highlightedPre = {
      type: "element",
      properties: { className: ["shiki", "github-light"] },
    };
    const tree = {
      children: [
        paragraph,
        {
          type: "root",
          children: [highlightedPre],
        },
      ],
    };

    rehypeBlockIndex()(tree);

    expect(paragraph.properties["data-block-index"]).toBe(0);
    expect(highlightedPre.properties["data-block-index"]).toBe(1);
  });
});
