import { getBlockPositions } from "./blockIndex";
import type { Comment, CommentType } from "../types/criticmarkup";
import {
  createQuestionThreadMetadata,
  createThreadReplyMetadata,
  serializeCommentBody,
} from "./commentProtocol";
import {
  escapeAnchorQuote,
  findQuoteOccurrences,
  getBlockPlainTextMap,
  plainRangeToMarkdownRange,
  resolveCommentAnchor,
} from "./commentAnchor";
import type { CommentAnchor } from "../types/criticmarkup";

// A segment maps a range of cleanMarkdown offsets to a range of raw offsets.
// Plain segments are 1:1; replaced segments (CriticMarkup spans) map any
// position within the clean replacement to the raw end of the markup.
interface Segment {
  cleanStart: number;
  cleanEnd: number;
  rawStart: number;
  rawEnd: number;
  isPlain: boolean;
}

function buildSegments(source: string, comments: Comment[]): Segment[] {
  const sorted = [...comments].sort((a, b) => a.rawStart - b.rawStart);
  const segs: Segment[] = [];
  let rawPos = 0;
  let cleanPos = 0;

  for (const c of sorted) {
    if (c.rawStart > rawPos) {
      const len = c.rawStart - rawPos;
      segs.push({
        cleanStart: cleanPos,
        cleanEnd: cleanPos + len,
        rawStart: rawPos,
        rawEnd: c.rawStart,
        isPlain: true,
      });
      cleanPos += len;
      rawPos = c.rawStart;
    }
    const cleanLen = c.cleanEnd - c.cleanStart;
    segs.push({
      cleanStart: cleanPos,
      cleanEnd: cleanPos + cleanLen,
      rawStart: rawPos,
      rawEnd: c.rawEnd,
      isPlain: false,
    });
    cleanPos += cleanLen;
    rawPos = c.rawEnd;
  }

  if (rawPos < source.length) {
    const len = source.length - rawPos;
    segs.push({
      cleanStart: cleanPos,
      cleanEnd: cleanPos + len,
      rawStart: rawPos,
      rawEnd: source.length,
      isPlain: true,
    });
  }

  return segs;
}

// Convert a cleanMarkdown offset to the corresponding raw content offset.
// For positions inside a CriticMarkup span, maps to the raw end (after the markup).
// Iterates backwards so that a cleanOffset on a shared boundary (e.g. a zero-width
// replacement) resolves to the later (non-plain) segment rather than the preceding plain one.
function cleanToRaw(cleanOffset: number, segments: Segment[]): number {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].cleanStart <= cleanOffset) {
      const seg = segments[i];
      return seg.isPlain
        ? seg.rawStart + (cleanOffset - seg.cleanStart)
        : seg.rawEnd;
    }
  }
  return cleanOffset;
}

function insertStandaloneAnchor(input: {
  rawContent: string;
  rawPosition: number;
  body: string;
  quote: string;
  occurrence: number;
  afterFence: boolean;
}): string {
  const suffix = ` @@ "${escapeAnchorQuote(input.quote)}"${input.occurrence > 1 ? ` @${input.occurrence}` : ""}`;
  const markup = `{>>${input.body}${suffix}<<}`;
  const separator = input.afterFence ? "\n" : "";
  return (
    input.rawContent.slice(0, input.rawPosition) +
    separator +
    markup +
    input.rawContent.slice(input.rawPosition)
  );
}

// Insert a new CriticMarkup comment after the block at blockIndex.
// Returns the updated raw content string.
export function insertComment(input: {
  rawContent: string;
  existingComments: Comment[];
  cleanMarkdown: string;
  blockIndex: number;
  type: CommentType;
  text: string;
  anchor?: Pick<CommentAnchor, "quote" | "occurrence" | "start" | "end">;
}): string {
  const blocks = getBlockPositions(input.cleanMarkdown);
  if (input.blockIndex < 0 || input.blockIndex >= blocks.length) {
    console.error("[insertComment] blockIndex out of range", {
      blockIndex: input.blockIndex,
      totalBlocks: blocks.length,
    });
    return input.rawContent;
  }

  const block = blocks[input.blockIndex];
  const blockEnd = block.end;
  const segments = buildSegments(input.rawContent, input.existingComments);

  const thread =
    input.type === "question" ? createQuestionThreadMetadata() : undefined;
  const body = serializeCommentBody({
    type: input.type,
    text: input.text,
    thread,
  });

  if (input.anchor) {
    const blockMap = getBlockPlainTextMap(
      input.cleanMarkdown,
      input.blockIndex,
    );
    if (blockMap) {
      const resolved = resolveCommentAnchor(blockMap.plainText, input.anchor);
      const selectedQuote = blockMap.plainText.slice(
        input.anchor.start,
        input.anchor.end,
      );
      const range = plainRangeToMarkdownRange(
        blockMap,
        input.anchor.start,
        input.anchor.end,
      );
      const validSelection =
        !resolved.orphaned &&
        selectedQuote === input.anchor.quote &&
        range !== null;
      if (validSelection && range) {
        const occurrences = findQuoteOccurrences(
          blockMap.plainText,
          input.anchor.quote,
        );
        const occurrence = Math.max(
          occurrences.indexOf(input.anchor.start) + 1,
          input.anchor.occurrence,
        );
        if (blockMap.kind === "code") {
          return insertStandaloneAnchor({
            rawContent: input.rawContent,
            rawPosition: cleanToRaw(blockEnd, segments),
            body,
            quote: input.anchor.quote,
            occurrence,
            afterFence: true,
          });
        }
        const intersectsMarkup = input.existingComments.some((comment) => {
          const hasVisibleRange = comment.cleanEnd > comment.cleanStart;
          if (hasVisibleRange) {
            return (
              comment.cleanStart < range.end && comment.cleanEnd > range.start
            );
          }
          return (
            comment.cleanStart > range.start && comment.cleanStart < range.end
          );
        });
        if (!intersectsMarkup) {
          const rawStart = cleanToRaw(range.start, segments);
          const rawEnd = cleanToRaw(range.end, segments);
          const rawSlice = input.rawContent.slice(rawStart, rawEnd);
          const markup = `{==${rawSlice}==}{>>${body}<<}`;
          return (
            input.rawContent.slice(0, rawStart) +
            markup +
            input.rawContent.slice(rawEnd)
          );
        }

        return insertStandaloneAnchor({
          rawContent: input.rawContent,
          rawPosition: cleanToRaw(blockEnd, segments),
          body,
          quote: input.anchor.quote,
          occurrence,
          afterFence: false,
        });
      }
    }
  }

  const rawPos = cleanToRaw(blockEnd, segments);
  const markup = `{>>${body}<<}`;
  return (
    input.rawContent.slice(0, rawPos) + markup + input.rawContent.slice(rawPos)
  );
}

export function insertThreadReply(input: {
  rawContent: string;
  root: Comment;
  replies: Comment[];
  type?: CommentType;
  text: string;
  authorLabel: string;
}): string {
  const thread = createThreadReplyMetadata({
    root: input.root,
    authorLabel: input.authorLabel,
  });
  if (!thread) {
    console.error("[insertThreadReply] root comment has no thread metadata", {
      rootId: input.root.id,
    });
    return input.rawContent;
  }

  const latestThreadComment = [input.root, ...input.replies]
    .filter(
      (comment) =>
        comment.thread?.threadId === thread.threadId &&
        (comment.id === input.root.id ||
          comment.thread?.replyTo === thread.replyTo),
    )
    .sort(
      (leftComment, rightComment) => rightComment.rawEnd - leftComment.rawEnd,
    )[0];

  const insertPosition = latestThreadComment?.rawEnd ?? input.root.rawEnd;
  const markup = `{>>${serializeCommentBody({
    type: input.type ?? "answer",
    text: input.text,
    thread,
  })}<<}`;

  return (
    input.rawContent.slice(0, insertPosition) +
    markup +
    input.rawContent.slice(insertPosition)
  );
}
