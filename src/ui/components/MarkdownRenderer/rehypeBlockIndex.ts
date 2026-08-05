interface BlockIndexNode {
  type: string;
  properties?: Record<string, unknown>;
  children?: BlockIndexNode[];
}

function findRenderedBlock(node: BlockIndexNode): BlockIndexNode | null {
  if (node.type === "element") {
    return node;
  }
  if (node.type !== "root" || !node.children) {
    return null;
  }
  for (const childNode of node.children) {
    const renderedBlock = findRenderedBlock(childNode);
    if (renderedBlock) {
      return renderedBlock;
    }
  }
  return null;
}

export function rehypeBlockIndex() {
  return (tree: { children: BlockIndexNode[] }) => {
    let blockIndex = 0;
    for (const node of tree.children) {
      const renderedBlock = findRenderedBlock(node);
      if (!renderedBlock) {
        continue;
      }
      renderedBlock.properties = renderedBlock.properties ?? {};
      renderedBlock.properties["data-block-index"] = blockIndex;
      blockIndex += 1;
    }
  };
}
