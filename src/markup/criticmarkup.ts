import type { Comment, CommentType, CriticType } from "../types/criticmarkup";
import { parseStructuredCommentBody } from "./commentProtocol";

export { isCommentType, parseCommentType } from "./commentProtocol";

// Combined regex matching all 5 CriticMarkup syntax types.
// Capture groups:
//   [1]+[2]: highlight+comment  — {==highlighted==}{>>comment<<}
//   [3]:     standalone comment — {>>comment<<}
//   [4]:     addition           — {++added++}
//   [5]:     deletion           — {--deleted--}
//   [6]+[7]: substitution       — {~~from~>to~~}
const CRITIC_RE =
  /\{==([\s\S]*?)==\}\{>>([\s\S]*?)<<\}|\{>>([\s\S]*?)<<\}|\{\+\+([\s\S]*?)\+\+\}|\{--([\s\S]*?)--\}|\{~~([\s\S]*?)~>([\s\S]*?)~~\}/g;

// Returns [start, end) byte ranges of all fenced code blocks (``` or ~~~).
// CriticMarkup that falls inside these ranges is left untouched.
function findCodeBlockRanges(source: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let fence: string | null = null;
  let fenceStart = 0;
  let i = 0;

  while (i < source.length) {
    const eolIdx = source.indexOf("\n", i);
    const lineEnd = eolIdx === -1 ? source.length : eolIdx;
    const line = source.slice(i, lineEnd);

    const m = /^(`{3,}|~{3,})/.exec(line);
    if (m) {
      if (!fence) {
        // Opening fence
        fence = m[1];
        fenceStart = i;
      } else if (
        line[0] === fence[0] &&
        m[1].length >= fence.length &&
        line.slice(m[1].length).trim() === ""
      ) {
        // Closing fence — include the newline at the end if present
        ranges.push([fenceStart, lineEnd]);
        fence = null;
      }
    }

    i = eolIdx === -1 ? source.length : eolIdx + 1;
  }

  return ranges;
}

function inCodeBlock(pos: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([s, e]) => pos >= s && pos < e);
}

export function parseCriticMarkup(source: string): {
  comments: Comment[];
  cleanMarkdown: string;
} {
  const codeRanges = findCodeBlockRanges(source);
  const comments: Comment[] = [];
  const cleanParts: string[] = [];
  let counter = 0;
  let lastRawEnd = 0;
  let cleanOffset = 0;

  CRITIC_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CRITIC_RE.exec(source)) !== null) {
    const rawStart = match.index;
    const rawEnd = rawStart + match[0].length;

    // Preserve CriticMarkup inside fenced code blocks verbatim
    if (inCodeBlock(rawStart, codeRanges)) {
      continue;
    }

    // Text between previous match and this one goes into the clean output as-is
    const before = source.slice(lastRawEnd, rawStart);
    cleanParts.push(before);
    cleanOffset += before.length;

    let criticType: CriticType;
    let type: CommentType = "note";
    let text: string;
    let highlightedText: string | undefined;
    let from: string | undefined;
    let to: string | undefined;
    let cleanReplacement: string;
    let thread: Comment["thread"] = undefined;

    if (match[1] !== undefined) {
      criticType = "highlight";
      highlightedText = match[1];
      ({ type, text, thread } = parseStructuredCommentBody(match[2]));
      cleanReplacement = match[1];
    } else if (match[3] !== undefined) {
      criticType = "comment";
      ({ type, text, thread } = parseStructuredCommentBody(match[3]));
      cleanReplacement = "";
    } else if (match[4] !== undefined) {
      criticType = "addition";
      text = match[4];
      cleanReplacement = match[4];
    } else if (match[5] !== undefined) {
      criticType = "deletion";
      text = match[5];
      cleanReplacement = "";
    } else {
      criticType = "substitution";
      from = match[6];
      to = match[7];
      text = match[7];
      cleanReplacement = match[7];
    }

    const cleanStart = cleanOffset;
    const cleanEnd = cleanStart + cleanReplacement.length;

    cleanParts.push(cleanReplacement);
    cleanOffset += cleanReplacement.length;
    lastRawEnd = rawEnd;

    comments.push({
      id: String(counter++),
      criticType,
      type,
      text,
      highlightedText,
      from,
      to,
      raw: match[0],
      rawStart,
      rawEnd,
      cleanStart,
      cleanEnd,
      thread,
    });
  }

  // Remaining text after the last match
  cleanParts.push(source.slice(lastRawEnd));

  return { comments, cleanMarkdown: cleanParts.join("") };
}

// Convenience wrapper — returns only the comment array.
export function extractComments(source: string): Comment[] {
  return parseCriticMarkup(source).comments;
}
