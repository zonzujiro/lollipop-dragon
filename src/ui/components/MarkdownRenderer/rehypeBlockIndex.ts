export function rehypeBlockIndex() {
  return (tree: {
    children: Array<{ type: string; properties?: Record<string, unknown> }>;
  }) => {
    let blockIndex = 0;
    for (const node of tree.children) {
      if (node.type === "element") {
        node.properties = node.properties ?? {};
        node.properties["data-block-index"] = blockIndex;
        blockIndex += 1;
      }
    }
  };
}
