import type { Comment } from "../types/criticmarkup";

export interface MarkdownMetadataField {
  key: string;
  values: string[];
  multiline: boolean;
}

export interface ParsedMarkdownFrontmatter {
  metadata: MarkdownMetadataField[];
  body: string;
  bodyStart: number;
}

function findFrontmatterEnd(source: string): {
  metadataText: string;
  bodyStart: number;
} | null {
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) {
    return null;
  }

  const lineBreak = source.startsWith("---\r\n") ? "\r\n" : "\n";
  let cursor = 3 + lineBreak.length;

  while (cursor <= source.length) {
    const nextBreak = source.indexOf(lineBreak, cursor);
    const lineEnd = nextBreak === -1 ? source.length : nextBreak;
    const line = source.slice(cursor, lineEnd);

    if (line.trim() === "---") {
      const metadataText = source.slice(3 + lineBreak.length, cursor);
      const bodyStart =
        nextBreak === -1 ? source.length : nextBreak + lineBreak.length;
      return { metadataText, bodyStart };
    }

    if (nextBreak === -1) {
      return null;
    }
    cursor = nextBreak + lineBreak.length;
  }

  return null;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseInlineList(value: string): string[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return null;
  }

  return trimmed
    .slice(1, -1)
    .split(",")
    .map((item) => unquote(item))
    .filter((item) => item.length > 0);
}

function parseMetadataLine(
  line: string,
): { key: string; value: string } | null {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  const key = line.slice(0, separatorIndex).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(key)) {
    return null;
  }

  return {
    key,
    value: line.slice(separatorIndex + 1).trim(),
  };
}

export function parseMarkdownFrontmatter(
  source: string,
): ParsedMarkdownFrontmatter {
  const frontmatter = findFrontmatterEnd(source);
  if (!frontmatter) {
    return { metadata: [], body: source, bodyStart: 0 };
  }

  const fields: MarkdownMetadataField[] = [];
  let activeField: MarkdownMetadataField | null = null;
  let activeBlockScalar = false;

  for (const line of frontmatter.metadataText.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const listMatch = /^\s*-\s+(.+)$/.exec(line);
    if (listMatch && activeField) {
      activeField.values.push(unquote(listMatch[1]));
      activeField.multiline = true;
      activeBlockScalar = false;
      continue;
    }

    const continuationMatch = /^\s+(.+)$/.exec(line);
    if (continuationMatch && activeField && activeBlockScalar) {
      const separator = activeField.values[0] ? " " : "";
      activeField.values[0] =
        activeField.values[0] + separator + continuationMatch[1].trim();
      continue;
    }

    const parsed = parseMetadataLine(line);
    if (!parsed) {
      activeField = null;
      activeBlockScalar = false;
      continue;
    }

    const inlineValues = parseInlineList(parsed.value);
    activeBlockScalar = parsed.value === ">" || parsed.value === "|";
    const values =
      inlineValues ??
      (activeBlockScalar ? [""] : parsed.value ? [unquote(parsed.value)] : []);
    activeField = {
      key: parsed.key,
      values,
      multiline: inlineValues !== null || values.length !== 1,
    };
    fields.push(activeField);
  }

  return {
    metadata: fields,
    body: source.slice(frontmatter.bodyStart),
    bodyStart: frontmatter.bodyStart,
  };
}

export function shiftCommentRawOffsets(
  comments: Comment[],
  bodyStart: number,
): Comment[] {
  if (bodyStart === 0) {
    return comments;
  }

  return comments.map((comment) => ({
    ...comment,
    rawStart: comment.rawStart + bodyStart,
    rawEnd: comment.rawEnd + bodyStart,
  }));
}
