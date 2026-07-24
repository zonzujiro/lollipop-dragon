import { describe, expect, it } from "vitest";
import { parseCriticMarkup } from "../../../markup";
import { makePeerComment } from "../../../testing/testHelpers";
import { buildMergedPeerCommentContent } from "../controller";

describe("peer range comment merge", () => {
  it("merges a peer range as a highlight at the selected quote", () => {
    const result = buildMergedPeerCommentContent(
      "A clear selected sentence for review.\n",
      makePeerComment({
        commentType: "fix",
        blockRef: {
          blockIndex: 0,
          contentPreview: "A clear selected sentence for review.",
          anchorVersion: 1,
          quote: "selected sentence",
          occurrence: 1,
        },
      }),
    );
    const parsed = parseCriticMarkup(result);

    expect(result).toContain("{==selected sentence==}");
    expect(parsed.comments[0]?.text).toBe("A comment");
    expect(parsed.comments[0]?.thread?.authorLabel).toBe("Alice");
  });

  it("keeps overlapping peer ranges as standalone anchored comments", () => {
    const result = buildMergedPeerCommentContent(
      "A {==selected sentence==}{>>[fix] Existing<<} for review.\n",
      makePeerComment({
        commentType: "clarify",
        text: "Explain the wording",
        blockRef: {
          blockIndex: 0,
          contentPreview: "A selected sentence for review.",
          anchorVersion: 1,
          quote: "selected sentence",
          occurrence: 1,
        },
      }),
    );
    const parsed = parseCriticMarkup(result);

    expect(result.match(/\{==selected sentence==\}/g)).toHaveLength(1);
    expect(parsed.comments).toHaveLength(2);
    expect(parsed.comments[1].anchor?.quote).toBe("selected sentence");
    expect(parsed.comments[1].text).toBe("Explain the wording");
    expect(parsed.comments[1].thread?.authorLabel).toBe("Alice");
  });

  it("preserves reviewer names containing metadata delimiters", () => {
    const result = buildMergedPeerCommentContent(
      "A paragraph for review.\n",
      makePeerComment({
        peerName: 'Alice "QA" & Bob <ops>',
      }),
    );
    const parsed = parseCriticMarkup(result);

    expect(result).toContain(
      'author="Alice &quot;QA&quot; &amp; Bob &lt;ops&gt;"',
    );
    expect(parsed.comments[0]?.thread?.authorLabel).toBe(
      'Alice "QA" & Bob <ops>',
    );
  });
});
