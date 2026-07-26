const STRUCTURAL_TEXT_CONTAINERS = new Set([
  "BLOCKQUOTE",
  "LI",
  "OL",
  "TABLE",
  "TBODY",
  "TFOOT",
  "THEAD",
  "TR",
  "UL",
]);

export function isIgnoredStructuralWhitespace(node: Node): boolean {
  return (
    node.nodeType === Node.TEXT_NODE &&
    node.textContent?.trim() === "" &&
    node.parentElement !== null &&
    STRUCTURAL_TEXT_CONTAINERS.has(node.parentElement.tagName)
  );
}

export function getAnchorText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return isIgnoredStructuralWhitespace(node) ? "" : (node.textContent ?? "");
  }
  let text = "";
  for (const childNode of node.childNodes) {
    text += getAnchorText(childNode);
  }
  return text;
}
