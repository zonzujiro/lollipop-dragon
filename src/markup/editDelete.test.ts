import { describe, it, expect } from "vitest";
import { replaceCommentMarkup, applyEdit } from "./editComment";
import { applyDelete, applyDeleteMany } from "./deleteComment";
import { makeComment } from "../testing/testHelpers";

describe("replaceCommentMarkup", () => {
  it("builds a note comment with no prefix", () => {
    expect(replaceCommentMarkup(makeComment(), "note", "my note")).toBe(
      "{>>my note<<}",
    );
  });

  it("builds a typed comment with prefix", () => {
    expect(replaceCommentMarkup(makeComment(), "fix", "fix this")).toBe(
      "{>>fix: fix this<<}",
    );
  });

  it("preserves highlight span when criticType is highlight", () => {
    const c = makeComment({
      criticType: "highlight",
      highlightedText: "important span",
    });
    expect(replaceCommentMarkup(c, "note", "a note")).toBe(
      "{==important span==}{>>a note<<}",
    );
  });

  it("preserves highlight span with typed prefix", () => {
    const c = makeComment({ criticType: "highlight", highlightedText: "text" });
    expect(replaceCommentMarkup(c, "rewrite", "rewrite it")).toBe(
      "{==text==}{>>rewrite: rewrite it<<}",
    );
  });

  it("preserves hidden thread metadata when editing a threaded question", () => {
    const c = makeComment({
      type: "question",
      text: "Why?",
      thread: {
        commentId: "mr-question-1",
        threadId: "mr-question-1",
      },
    });
    expect(replaceCommentMarkup(c, "question", "Updated why?")).toBe(
      '{>>question: Updated why? [markreview id="mr-question-1" thread="mr-question-1"]<<}',
    );
  });

  it("preserves reply metadata and author label when editing an answer", () => {
    const c = makeComment({
      type: "answer",
      text: "Because.",
      thread: {
        commentId: "mr-answer-1",
        threadId: "mr-question-1",
        replyTo: "mr-question-1",
        authorLabel: "Codex",
      },
    });
    expect(replaceCommentMarkup(c, "answer", "Updated answer")).toBe(
      '{>>answer: Updated answer [markreview id="mr-answer-1" thread="mr-question-1" replyTo="mr-question-1" author="Codex"]<<}',
    );
  });
});

describe("applyEdit", () => {
  it("replaces comment in the middle of the content", () => {
    const raw = "Before.{>>old<<}After.";
    const c = makeComment({ raw: "{>>old<<}", rawStart: 7, rawEnd: 16 });
    expect(applyEdit(raw, c, "fix", "new")).toBe("Before.{>>fix: new<<}After.");
  });

  it("replaces comment at the start", () => {
    const raw = "{>>start<<}rest";
    const c = makeComment({ raw: "{>>start<<}", rawStart: 0, rawEnd: 11 });
    expect(applyEdit(raw, c, "note", "updated")).toBe("{>>updated<<}rest");
  });
});

describe("applyDelete", () => {
  it("removes the comment markup from content", () => {
    const raw = "Hello.{>>delete me<<} World.";
    const c = makeComment({ rawStart: 6, rawEnd: 21 });
    expect(applyDelete(raw, c)).toBe("Hello. World.");
  });

  it("removes a comment at the start", () => {
    const raw = "{>>start<<}rest";
    const c = makeComment({ rawStart: 0, rawEnd: 11 });
    expect(applyDelete(raw, c)).toBe("rest");
  });

  it("removes a comment at the end", () => {
    const raw = "content{>>end<<}";
    const c = makeComment({ rawStart: 7, rawEnd: 16 });
    expect(applyDelete(raw, c)).toBe("content");
  });

  it("removes multiple comments using original raw offsets", () => {
    const raw = "A{>>q<<}B{>>a<<}C";
    const question = makeComment({ rawStart: 1, rawEnd: 8 });
    const answer = makeComment({ rawStart: 9, rawEnd: 16 });
    expect(applyDeleteMany(raw, [question, answer])).toBe("ABC");
  });
});
