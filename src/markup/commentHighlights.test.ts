import { describe, expect, it } from "vitest";
import { makeComment } from "../testing/testHelpers";
import {
  applyCommentHighlights,
  buildCommentHighlightSegments,
} from "./commentHighlights";

function anchoredComment(input: { id: string; start: number; end: number }) {
  return makeComment({
    id: input.id,
    rawStart: input.start,
    anchor: {
      quote: input.id,
      occurrence: 1,
      start: input.start,
      end: input.end,
    },
  });
}

describe("buildCommentHighlightSegments", () => {
  it("splits intersecting comments into constant covering sets", () => {
    const first = anchoredComment({ id: "first", start: 2, end: 8 });
    const second = anchoredComment({ id: "second", start: 5, end: 11 });

    expect(buildCommentHighlightSegments(14, [first, second])).toEqual([
      { start: 2, end: 5, comments: [first] },
      { start: 5, end: 8, comments: [first, second] },
      { start: 8, end: 11, comments: [second] },
    ]);
  });

  it("excludes orphaned and block-level comments", () => {
    const orphan = makeComment({
      id: "orphan",
      anchor: {
        quote: "gone",
        occurrence: 1,
        start: -1,
        end: -1,
        orphaned: true,
      },
    });

    expect(buildCommentHighlightSegments(10, [makeComment(), orphan])).toEqual(
      [],
    );
  });

  it("renders three overlap segments, cycles the shared span, and cleans up after resolve", () => {
    const first = anchoredComment({ id: "first", start: 2, end: 8 });
    const second = anchoredComment({ id: "second", start: 5, end: 11 });
    first.blockIndex = 0;
    second.blockIndex = 0;
    const container = document.createElement("div");
    container.innerHTML = '<p data-block-index="0">abcdefghijklmn</p>';
    const selections: string[] = [];

    applyCommentHighlights({
      container,
      comments: [first, second],
      activeCommentId: null,
      onSelect: (commentId) => selections.push(commentId),
    });

    const highlights = container.querySelectorAll(".comment-highlight");
    expect(highlights).toHaveLength(3);
    expect(highlights[1].getAttribute("data-cids")).toBe("first second");
    highlights[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(selections).toEqual(["first"]);

    applyCommentHighlights({
      container,
      comments: [second],
      activeCommentId: "second",
      onSelect: (commentId) => selections.push(commentId),
    });
    expect(container.querySelectorAll(".comment-highlight")).toHaveLength(1);
    expect(container.textContent).toBe("abcdefghijklmn");
  });

  it("segments a 10k-line-sized block within the interaction budget", () => {
    const comments = Array.from({ length: 200 }, (_, index) =>
      anchoredComment({
        id: `comment-${index}`,
        start: index * 100,
        end: index * 100 + 180,
      }),
    );
    const startedAt = performance.now();
    const segments = buildCommentHighlightSegments(500_000, comments);
    const elapsed = performance.now() - startedAt;

    expect(segments.length).toBeGreaterThan(200);
    expect(elapsed).toBeLessThan(100);
  });
});
