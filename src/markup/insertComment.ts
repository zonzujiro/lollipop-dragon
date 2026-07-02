import { getBlockPositions } from "./blockIndex";
import type { Comment, CommentType } from "../types/criticmarkup";
import {
  createQuestionThreadMetadata,
  createThreadReplyMetadata,
  serializeCommentBody,
} from "./commentProtocol";

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

// Insert a new CriticMarkup comment after the block at blockIndex.
// Returns the updated raw content string.
export function insertComment(input: {
  rawContent: string;
  existingComments: Comment[];
  cleanMarkdown: string;
  blockIndex: number;
  type: CommentType;
  text: string;
}): string {
  const blocks = getBlockPositions(input.cleanMarkdown);
  if (input.blockIndex < 0 || input.blockIndex >= blocks.length) {
    console.error("[insertComment] blockIndex out of range", {
      blockIndex: input.blockIndex,
      totalBlocks: blocks.length,
    });
    return input.rawContent;
  }

  const blockEnd = blocks[input.blockIndex].end;
  const segments = buildSegments(input.rawContent, input.existingComments);
  const rawPos = cleanToRaw(blockEnd, segments);

  const thread =
    input.type === "question" ? createQuestionThreadMetadata() : undefined;
  const markup = `{>>${serializeCommentBody({
    type: input.type,
    text: input.text,
    thread,
  })}<<}`;
  return (
    input.rawContent.slice(0, rawPos) + markup + input.rawContent.slice(rawPos)
  );
}

export function insertThreadReply(input: {
  rawContent: string;
  root: Comment;
  replies: Comment[];
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
    type: "answer",
    text: input.text,
    thread,
  })}<<}`;

  return (
    input.rawContent.slice(0, insertPosition) +
    markup +
    input.rawContent.slice(insertPosition)
  );
}
