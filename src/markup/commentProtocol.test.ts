import { describe, expect, it } from "vitest";
import { extractComments } from "./criticmarkup";
import { buildCommentThreadGroups } from "./commentProtocol";

describe("buildCommentThreadGroups", () => {
  it("places a nested answer after its parent before later sibling replies", () => {
    const comments = extractComments(
      [
        '{>>question: What is this and why is it needed? [markreview id="mr-question" thread="mr-question"]<<}',
        '{>>answer: How would this be implemented and where? [markreview id="mr-user-1" thread="mr-question" replyTo="mr-question" author="You"]<<}',
        '{>>answer: So the agent picks one available shape? [markreview id="mr-user-2" thread="mr-question" replyTo="mr-question" author="You"]<<}',
        '{>>answer: Add the dataset-backed description in ai-core. [markreview id="mr-agent" thread="mr-question" replyTo="mr-user-1" author="Claude"]<<}',
      ].join(""),
    );

    const groups = buildCommentThreadGroups(comments);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.root.text).toBe("What is this and why is it needed?");
    expect(groups[0]?.replies.map((reply) => reply.text)).toEqual([
      "How would this be implemented and where?",
      "Add the dataset-backed description in ai-core.",
      "So the agent picks one available shape?",
    ]);
  });

  it("keeps sibling replies in document order", () => {
    const comments = extractComments(
      [
        '{>>question: Why? [markreview id="mr-question" thread="mr-question"]<<}',
        '{>>answer: First sibling. [markreview id="mr-first" thread="mr-question" replyTo="mr-question" author="You"]<<}',
        '{>>answer: Second sibling. [markreview id="mr-second" thread="mr-question" replyTo="mr-question" author="You"]<<}',
      ].join(""),
    );

    const groups = buildCommentThreadGroups(comments);

    expect(groups[0]?.replies.map((reply) => reply.text)).toEqual([
      "First sibling.",
      "Second sibling.",
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
