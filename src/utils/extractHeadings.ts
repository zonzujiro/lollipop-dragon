import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";

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
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(cleanMarkdown) as {
    children: MdastNode[];
  };

  const headings: Heading[] = [];
  for (let i = 0; i < tree.children.length; i++) {
    const node = tree.children[i];
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
