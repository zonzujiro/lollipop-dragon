import { getRenderedBlocks } from "../markup/commentAnchor";

export interface Heading {
  level: number;
  text: string;
  blockIndex: number;
}

interface MdastNode {
  type: string;
  depth?: number;
  children?: MdastNode[];
  value?: string;
}

function extractText(node: MdastNode): string {
  if (node.value) {
    return node.value;
  }
  if (node.children) {
    return node.children.map(extractText).join("");
  }
  return "";
}

/**
 * Parse raw markdown (after CriticMarkup stripping) and return all headings
 * with their level, text content, and top-level block index.
 */
export function extractHeadings(cleanMarkdown: string): Heading[] {
  // Index over RENDERED blocks: footnote/link definitions produce no element,
  // so counting raw mdast children would drift every index after them.
  const { nodes } = getRenderedBlocks(cleanMarkdown);

  const headings: Heading[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type === "heading" && node.depth !== undefined) {
      headings.push({
        level: node.depth,
        text: extractText(node),
        blockIndex: i,
      });
    }
  }
  return headings;
}
