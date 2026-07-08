import { describe, expect, it } from "vitest";
import { extractComments } from "./criticmarkup";
import { buildCommentThreadGroups } from "./commentProtocol";

describe("buildCommentThreadGroups", () => {
  it("includes replies to earlier replies in the root thread", () => {
    const comments = extractComments(
      [
        '{>>question: What is this and why is it needed? [markreview id="mr-question" thread="mr-question"]<<}',
        '{>>answer: It validates the selected asset. [markreview id="mr-agent-1" thread="mr-question" replyTo="mr-question" author="Claude"]<<}',
        '{>>answer: How does that apply when nothing is generated? [markreview id="mr-user" thread="mr-question" replyTo="mr-question" author="You"]<<}',
        '{>>answer: It guards the selected reference rather than generated output. [markreview id="mr-agent-2" thread="mr-question" replyTo="mr-user" author="Claude"]<<}',
      ].join(""),
    );

    const groups = buildCommentThreadGroups(comments);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.root.text).toBe("What is this and why is it needed?");
    expect(groups[0]?.replies.map((reply) => reply.text)).toEqual([
      "It validates the selected asset.",
      "How does that apply when nothing is generated?",
      "It guards the selected reference rather than generated output.",
    ]);
  });

  it("keeps a reply with a mismatched thread visible as a standalone group", () => {
    const comments = extractComments(
      [
        '{>>question: Why? [markreview id="mr-question" thread="mr-question"]<<}',
        '{>>answer: Because. [markreview id="mr-answer" thread="mr-other" replyTo="mr-question" author="Claude"]<<}',
      ].join(""),
    );

    const groups = buildCommentThreadGroups(comments);

    expect(groups.map((group) => group.root.text)).toEqual([
      "Why?",
      "Because.",
    ]);
  });

  it("keeps cyclic replies visible as standalone groups", () => {
    const comments = extractComments(
      [
        '{>>answer: First. [markreview id="mr-first" thread="mr-thread" replyTo="mr-second" author="Claude"]<<}',
        '{>>answer: Second. [markreview id="mr-second" thread="mr-thread" replyTo="mr-first" author="You"]<<}',
      ].join(""),
    );

    const groups = buildCommentThreadGroups(comments);

    expect(groups.map((group) => group.root.text)).toEqual([
      "First.",
      "Second.",
    ]);
  });
});
