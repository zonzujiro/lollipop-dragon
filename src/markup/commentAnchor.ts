import type { Nodes } from "mdast";
import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import type { CommentAnchor } from "../types/criticmarkup";

interface PlainCharacter {
  rawStart: number;
  rawEnd: number;
}

export interface BlockPlainTextMap {
  plainText: string;
  characters: PlainCharacter[];
  kind: "code" | "other";
}

function findCharacterOffsets(value: string, raw: string, rawStart: number) {
  const characters: PlainCharacter[] = [];
  let cursor = 0;
  for (const character of value) {
    const foundAt = raw.indexOf(character, cursor);
    const localStart = foundAt >= 0 ? foundAt : cursor;
    characters.push({
      rawStart: rawStart + localStart,
      rawEnd: rawStart + localStart + character.length,
    });
    cursor = localStart + character.length;
  }
  return characters;
}

function collectPlainText(
  node: Nodes,
  source: string,
  values: string[],
  characters: PlainCharacter[],
) {
  if (
    node.type === "text" ||
    node.type === "inlineCode" ||
    node.type === "code"
  ) {
    const rawStart = node.position?.start.offset;
    const rawEnd = node.position?.end.offset;
    if (rawStart === undefined || rawEnd === undefined) {
      return;
    }
    values.push(node.value);
    characters.push(
      ...findCharacterOffsets(
        node.value,
        source.slice(rawStart, rawEnd),
        rawStart,
      ),
    );
    return;
  }
  if (node.type === "break") {
    const rawStart = node.position?.start.offset;
    const rawEnd = node.position?.end.offset;
    if (rawStart !== undefined && rawEnd !== undefined) {
      values.push("\n");
      characters.push({ rawStart, rawEnd });
    }
    return;
  }
  if ("children" in node) {
    for (const child of node.children) {
      collectPlainText(child, source, values, characters);
    }
  }
}

// Node types that produce no rendered top-level element: link/footnote
// definitions are hoisted (footnotes into one trailing section), raw HTML is
// dropped without rehype-raw, yaml is frontmatter. Block indices must count
// only what the renderer counts, or every index after them drifts.
const UNRENDERED_BLOCK_TYPES = new Set([
  "footnoteDefinition",
  "definition",
  "html",
  "yaml",
]);

export interface RenderedBlocks {
  nodes: Nodes[];
  footnoteDefinitions: Nodes[];
}

export function getRenderedBlocks(markdown: string): RenderedBlocks {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const nodes: Nodes[] = [];
  const footnoteDefinitions: Nodes[] = [];
  for (const child of tree.children) {
    if (child.type === "footnoteDefinition") {
      footnoteDefinitions.push(child);
    } else if (!UNRENDERED_BLOCK_TYPES.has(child.type)) {
      nodes.push(child);
    }
  }
  return { nodes, footnoteDefinitions };
}

export function getBlockPlainTextMap(
  markdown: string,
  blockIndex: number,
): BlockPlainTextMap | null {
  const { nodes, footnoteDefinitions } = getRenderedBlocks(markdown);
  const values: string[] = [];
  const characters: PlainCharacter[] = [];
  const block = nodes[blockIndex];
  if (block) {
    collectPlainText(block, markdown, values, characters);
    return {
      plainText: values.join(""),
      characters,
      kind: block.type === "code" ? "code" : "other",
    };
  }
  // one virtual block past the rendered ones = the collected footnotes section
  if (blockIndex === nodes.length && footnoteDefinitions.length > 0) {
    for (const definition of footnoteDefinitions) {
      collectPlainText(definition, markdown, values, characters);
    }
    return {
      plainText: values.join(""),
      characters,
      kind: "other",
    };
  }
  return null;
}

export function getPlainText(markdown: string): string {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const values: string[] = [];
  const characters: PlainCharacter[] = [];
  for (const block of tree.children) {
    collectPlainText(block, markdown, values, characters);
  }
  return values.join("");
}

export function findQuoteOccurrences(
  plainText: string,
  quote: string,
): number[] {
  if (!quote) {
    return [];
  }
  const occurrences: number[] = [];
  let cursor = 0;
  while (cursor <= plainText.length - quote.length) {
    const foundAt = plainText.indexOf(quote, cursor);
    if (foundAt < 0) {
      break;
    }
    occurrences.push(foundAt);
    cursor = foundAt + Math.max(quote.length, 1);
  }
  return occurrences;
}

function normalizeWithOffsets(value: string) {
  let normalized = "";
  const offsets: number[] = [];
  let inWhitespace = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (/\s/.test(character)) {
      if (!inWhitespace && normalized.length > 0) {
        normalized += " ";
        offsets.push(index);
      }
      inWhitespace = true;
      continue;
    }
    normalized += character;
    offsets.push(index);
    inWhitespace = false;
  }
  if (normalized.endsWith(" ")) {
    normalized = normalized.slice(0, -1);
    offsets.pop();
  }
  return { normalized, offsets };
}

export function resolveCommentAnchor(
  plainText: string,
  durableAnchor: Pick<CommentAnchor, "quote" | "occurrence">,
): CommentAnchor {
  const exactOccurrences = findQuoteOccurrences(plainText, durableAnchor.quote);
  const requestedStart = exactOccurrences[durableAnchor.occurrence - 1];
  const exactStart = requestedStart ?? exactOccurrences[0];
  if (exactStart !== undefined) {
    return {
      quote: durableAnchor.quote,
      occurrence: exactOccurrences.indexOf(exactStart) + 1,
      start: exactStart,
      end: exactStart + durableAnchor.quote.length,
      orphaned: false,
    };
  }

  const normalizedPlain = normalizeWithOffsets(plainText);
  const normalizedQuote = normalizeWithOffsets(durableAnchor.quote).normalized;
  const normalizedStart = normalizedPlain.normalized.indexOf(normalizedQuote);
  if (normalizedQuote && normalizedStart >= 0) {
    const start = normalizedPlain.offsets[normalizedStart] ?? 0;
    const normalizedEnd = normalizedStart + normalizedQuote.length - 1;
    const end = (normalizedPlain.offsets[normalizedEnd] ?? start) + 1;
    return {
      quote: durableAnchor.quote,
      occurrence: 1,
      start,
      end,
      orphaned: false,
    };
  }

  return {
    quote: durableAnchor.quote,
    occurrence: durableAnchor.occurrence,
    start: -1,
    end: -1,
    orphaned: true,
  };
}

export function plainRangeToMarkdownRange(
  map: BlockPlainTextMap,
  start: number,
  end: number,
): { start: number; end: number } | null {
  const first = map.characters[start];
  const last = map.characters[end - 1];
  if (!first || !last || start < 0 || end <= start) {
    return null;
  }
  return { start: first.rawStart, end: last.rawEnd };
}

export function escapeAnchorQuote(quote: string): string {
  return quote.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
