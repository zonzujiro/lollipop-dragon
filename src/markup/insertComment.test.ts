import { describe, it, expect } from "vitest";
import { insertComment, insertThreadReply } from "./insertComment";
import { makeComment } from "../testing/testHelpers";
import { assignBlockIndices } from "./blockIndex";
import { parseCriticMarkup } from "./criticmarkup";

describe("insertComment — plain content (no existing markup)", () => {
  it("appends a note comment (no prefix) after the first paragraph", () => {
    const raw = "Hello world.\n\nSecond paragraph.";
    const result = insertComment({
      rawContent: raw,
      existingComments: [],
      cleanMarkdown: raw,
      blockIndex: 0,
      type: "note",
      text: "my note",
    });
    expect(result).toBe("Hello world.{>>my note<<}\n\nSecond paragraph.");
  });

  it("appends a typed comment with its prefix after a later paragraph", () => {
    const raw = "First.\n\nSecond.";
    const result = insertComment({
      rawContent: raw,
      existingComments: [],
      cleanMarkdown: raw,
      blockIndex: 1,
      type: "fix",
      text: "fix this",
    });
    expect(result).toBe("First.\n\nSecond.{>>fix: fix this<<}");
  });

  it("returns rawContent unchanged when blockIndex is out of range", () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = "Single paragraph.";
    expect(
      insertComment({
        rawContent: raw,
        existingComments: [],
        cleanMarkdown: raw,
        blockIndex: 5,
        type: "note",
        text: "hi",
      }),
    ).toBe(raw);
    expect(
      insertComment({
        rawContent: raw,
        existingComments: [],
        cleanMarkdown: raw,
        blockIndex: -1,
        type: "note",
        text: "hi",
      }),
    ).toBe(raw);
    expect(errorLog).toHaveBeenCalledTimes(2);
  });

  it("handles a single-paragraph document", () => {
    const raw = "Only paragraph.";
    const result = insertComment({
      rawContent: raw,
      existingComments: [],
      cleanMarkdown: raw,
      blockIndex: 0,
      type: "rewrite",
      text: "rewrite it",
    });
    expect(result).toBe("Only paragraph.{>>rewrite: rewrite it<<}");
  });

  it("adds hidden thread metadata when inserting a question", () => {
    const raw = "Only paragraph.";
    const result = insertComment({
      rawContent: raw,
      existingComments: [],
      cleanMarkdown: raw,
      blockIndex: 0,
      type: "question",
      text: "Why is this here?",
    });

    expect(result).toMatch(
      /Only paragraph\.\{>>question: Why is this here\? \[markreview id="mr-[^"]+" thread="mr-[^"]+"\]<<}/,
    );
  });
});

describe("insertComment range anchors", () => {
  it("keeps fence bytes intact and serializes a repeated-line anchor after the fence", () => {
    const fence = [
      "```ts",
      "const target = read();",
      "const target = read();",
      "```",
    ].join("\n");
    const rawContent = `${fence}\n\nAfter.`;
    const parsed = parseCriticMarkup(rawContent);
    const result = insertComment({
      rawContent,
      existingComments: parsed.comments,
      cleanMarkdown: parsed.cleanMarkdown,
      blockIndex: 0,
      type: "fix",
      text: "Use a distinct name.",
      anchor: {
        quote: "const target = read();",
        occurrence: 2,
        start: 23,
        end: 45,
      },
    });

    expect(result.slice(0, fence.length)).toBe(fence);
    expect(result).toBe(
      `${fence}\n{>>fix: Use a distinct name. @@ "const target = read();" @2<<}\n\nAfter.`,
    );
    const reparsed = parseCriticMarkup(result);
    const [comment] = assignBlockIndices(
      reparsed.comments,
      reparsed.cleanMarkdown,
    );
    expect(comment.blockIndex).toBe(0);
    expect(comment.anchor).toMatchObject({
      quote: "const target = read();",
      occurrence: 2,
      start: 23,
      end: 45,
      orphaned: false,
    });
  });

  it("wraps an unoccupied mid-sentence range while preserving markdown", () => {
    const rawContent = "Read **this exact text** now.";
    const parsed = parseCriticMarkup(rawContent);
    const result = insertComment({
      rawContent,
      existingComments: parsed.comments,
      cleanMarkdown: parsed.cleanMarkdown,
      blockIndex: 0,
      type: "fix",
      text: "Tighten this.",
      anchor: {
        quote: "this exact text",
        occurrence: 1,
        start: 5,
        end: 20,
      },
    });

    expect(result).toBe(
      "Read **{==this exact text==}{>>fix: Tighten this.<<}** now.",
    );
    const reparsed = parseCriticMarkup(result);
    const [comment] = assignBlockIndices(
      reparsed.comments,
      reparsed.cleanMarkdown,
    );
    expect(comment.anchor?.quote).toBe("this exact text");
  });

  it("uses a standalone anchor when the range crosses markdown formatting boundaries", () => {
    const rawContent =
      "**`external-products/editor-elements/AGENTS.md` (lean orientation + links, Harmony-owned).** Contains only:";
    const quote =
      "external-products/editor-elements/AGENTS.md (lean orientation + links, Harmony-owned). Contains only:";
    const parsed = parseCriticMarkup(rawContent);
    const result = insertComment({
      rawContent,
      existingComments: parsed.comments,
      cleanMarkdown: parsed.cleanMarkdown,
      blockIndex: 0,
      type: "clarify",
      text: "Explain how user stories work here.",
      anchor: {
        quote,
        occurrence: 1,
        start: 0,
        end: quote.length,
      },
    });

    expect(result).toBe(
      `${rawContent}{>>clarify: Explain how user stories work here. @@ "${quote}"<<}`,
    );
    expect(result).not.toContain("{==");

    const reparsed = parseCriticMarkup(result);
    const [comment] = assignBlockIndices(
      reparsed.comments,
      reparsed.cleanMarkdown,
    );
    expect(reparsed.cleanMarkdown).toBe(rawContent);
    expect(comment.anchor).toMatchObject({
      quote,
      occurrence: 1,
      start: 0,
      end: quote.length,
      orphaned: false,
    });
  });

  it("uses anchored standalone form when ranges overlap", () => {
    const rawContent = "One {==shared range==}{>>fix: first<<} here.";
    const parsed = parseCriticMarkup(rawContent);
    const result = insertComment({
      rawContent,
      existingComments: parsed.comments,
      cleanMarkdown: parsed.cleanMarkdown,
      blockIndex: 0,
      type: "clarify",
      text: "second",
      anchor: {
        quote: "shared range",
        occurrence: 1,
        start: 4,
        end: 16,
      },
    });

    expect(result).toBe(
      'One {==shared range==}{>>fix: first<<} here.{>>clarify: second @@ "shared range"<<}',
    );
    expect(parseCriticMarkup(result).comments).toHaveLength(2);
  });

  it("escapes anchored quotes and keeps occurrence identity", () => {
    const rawContent = 'Say "yes" and {=="yes"==}{>>note: existing<<}.';
    const parsed = parseCriticMarkup(rawContent);
    const result = insertComment({
      rawContent,
      existingComments: parsed.comments,
      cleanMarkdown: parsed.cleanMarkdown,
      blockIndex: 0,
      type: "question",
      text: "Why?",
      anchor: {
        quote: '"yes"',
        occurrence: 2,
        start: 14,
        end: 19,
      },
    });

    expect(result).toContain('@@ "\\"yes\\"" @2');
  });
});

describe("insertComment — content with existing CriticMarkup", () => {
  it("inserts after a block that ends with a {>>comment<<} (zero-width replacement)", () => {
    // raw: "Hello.{>>existing<<}\n\nSecond."
    // comment removes itself from clean ("Hello.\n\nSecond.")
    const raw = "Hello.{>>existing<<}\n\nSecond.";
    const clean = "Hello.\n\nSecond.";
    const existing = [
      makeComment({ rawStart: 6, rawEnd: 20, cleanStart: 6, cleanEnd: 6 }),
      // {>>existing<<} = 14 chars (6..20)
    ];
    const result = insertComment({
      rawContent: raw,
      existingComments: existing,
      cleanMarkdown: clean,
      blockIndex: 0,
      type: "note",
      text: "new",
    });
    // Block 0 ends at clean offset 6, which maps to raw offset 20 (after the markup)
    expect(result).toBe("Hello.{>>existing<<}{>>new<<}\n\nSecond.");
  });

  it("inserts after a block containing a {++addition++} (text kept in clean)", () => {
    // raw: "Hello {++world++}.\n\nSecond."
    // clean: "Hello world.\n\nSecond."
    const raw = "Hello {++world++}.\n\nSecond.";
    const clean = "Hello world.\n\nSecond.";
    const existing = [
      makeComment({
        criticType: "addition",
        rawStart: 6,
        rawEnd: 17, // "{++world++}" = 11 chars
        cleanStart: 6,
        cleanEnd: 11, // "world" = 5 chars
      }),
    ];
    const result = insertComment({
      rawContent: raw,
      existingComments: existing,
      cleanMarkdown: clean,
      blockIndex: 0,
      type: "note",
      text: "note",
    });
    // Block 0 ends at clean offset 12 ("Hello world."), which is in the plain
    // segment after the addition span. Raw offset = 17 + (12 - 11) = 18 (the '.')
    expect(result).toBe("Hello {++world++}.{>>note<<}\n\nSecond.");
  });

  it("inserts after the second block in a multi-block document with markup", () => {
    const raw = "Para one.\n\nPara two.{>>existing<<}";
    const clean = "Para one.\n\nPara two.";
    const existing = [
      makeComment({ rawStart: 20, rawEnd: 34, cleanStart: 20, cleanEnd: 20 }),
    ];
    const result = insertComment({
      rawContent: raw,
      existingComments: existing,
      cleanMarkdown: clean,
      blockIndex: 1,
      type: "fix",
      text: "fix it",
    });
    expect(result).toBe(
      "Para one.\n\nPara two.{>>existing<<}{>>fix: fix it<<}",
    );
  });
});

describe("insertThreadReply", () => {
  it("adds a linked answer after the root question when there are no replies", () => {
    const questionRaw =
      '{>>question: Why? [markreview id="mr-question-1" thread="mr-question-1"]<<}';
    const raw = `Before ${questionRaw} after`;
    const questionStart = raw.indexOf(questionRaw);
    const root = makeComment({
      id: "question-root",
      type: "question",
      raw: questionRaw,
      rawStart: questionStart,
      rawEnd: questionStart + questionRaw.length,
      thread: {
        commentId: "mr-question-1",
        threadId: "mr-question-1",
      },
    });

    const result = insertThreadReply({
      rawContent: raw,
      root,
      replies: [],
      text: "Because it explains the fallback.",
      authorLabel: "You",
    });

    expect(result).toMatch(
      /Before \{>>question: Why\? \[markreview id="mr-question-1" thread="mr-question-1"\]<<}\{>>answer: Because it explains the fallback\. \[markreview id="mr-[^"]+" thread="mr-question-1" replyTo="mr-question-1" author="You"\]<<} after/,
    );
  });

  it("adds a linked answer after the latest existing reply", () => {
    const questionRaw =
      '{>>question: Why? [markreview id="mr-question-1" thread="mr-question-1"]<<}';
    const answerRaw =
      '{>>answer: Existing answer. [markreview id="mr-answer-1" thread="mr-question-1" replyTo="mr-question-1" author="Codex"]<<}';
    const raw = `${questionRaw} middle ${answerRaw} end`;
    const questionStart = raw.indexOf(questionRaw);
    const answerStart = raw.indexOf(answerRaw);
    const root = makeComment({
      id: "question-root",
      type: "question",
      raw: questionRaw,
      rawStart: questionStart,
      rawEnd: questionStart + questionRaw.length,
      thread: {
        commentId: "mr-question-1",
        threadId: "mr-question-1",
      },
    });
    const reply = makeComment({
      id: "answer-reply",
      type: "answer",
      raw: answerRaw,
      rawStart: answerStart,
      rawEnd: answerStart + answerRaw.length,
      thread: {
        commentId: "mr-answer-1",
        threadId: "mr-question-1",
        replyTo: "mr-question-1",
        authorLabel: "Codex",
      },
    });

    const result = insertThreadReply({
      rawContent: raw,
      root,
      replies: [reply],
      text: "Follow-up answer.",
      authorLabel: "You",
    });

    expect(result).toMatch(
      /\{>>answer: Existing answer\. \[markreview id="mr-answer-1" thread="mr-question-1" replyTo="mr-question-1" author="Codex"\]<<}\{>>answer: Follow-up answer\. \[markreview id="mr-[^"]+" thread="mr-question-1" replyTo="mr-question-1" author="You"\]<<} end/,
    );
  });

  it("adds a linked action reply with the selected action type", () => {
    const questionRaw =
      '{>>question: Why? [markreview id="mr-question-1" thread="mr-question-1"]<<}';
    const raw = `Before ${questionRaw} after`;
    const questionStart = raw.indexOf(questionRaw);
    const root = makeComment({
      id: "question-root",
      type: "question",
      raw: questionRaw,
      rawStart: questionStart,
      rawEnd: questionStart + questionRaw.length,
      thread: {
        commentId: "mr-question-1",
        threadId: "mr-question-1",
      },
    });

    const result = insertThreadReply({
      rawContent: raw,
      root,
      replies: [],
      type: "remove",
      text: "Delete this paragraph.",
      authorLabel: "You",
    });

    expect(result).toMatch(
      /Before \{>>question: Why\? \[markreview id="mr-question-1" thread="mr-question-1"\]<<}\{>>remove: Delete this paragraph\. \[markreview id="mr-[^"]+" thread="mr-question-1" replyTo="mr-question-1" author="You"\]<<} after/,
    );
  });
});
