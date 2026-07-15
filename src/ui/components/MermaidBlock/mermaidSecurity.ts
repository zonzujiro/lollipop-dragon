const BLOCKED_ELEMENTS = [
  "script",
  "foreignObject",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
];

const URL_ATTRIBUTES = new Set(["href", "xlink:href", "src"]);
const UNSAFE_CSS_PATTERN = /@import|expression\s*\(|javascript\s*:/gi;
const CSS_URL_PATTERN = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;

function sanitizeCss(css: string): string {
  const withoutUnsafeConstructs = css.replace(UNSAFE_CSS_PATTERN, "");
  return withoutUnsafeConstructs.replace(
    CSS_URL_PATTERN,
    (_match, _quote: string, url: string) =>
      url.trim().startsWith("#") ? `url(${url.trim()})` : "none",
  );
}

function sanitizeElement(element: Element): void {
  for (const attribute of Array.from(element.attributes)) {
    const attributeName = attribute.name.toLowerCase();
    if (attributeName.startsWith("on")) {
      element.removeAttribute(attribute.name);
      continue;
    }
    if (URL_ATTRIBUTES.has(attributeName)) {
      const url = attribute.value.trim();
      if (!url.startsWith("#")) {
        element.removeAttribute(attribute.name);
      }
      continue;
    }
    if (attributeName === "style") {
      element.setAttribute(attribute.name, sanitizeCss(attribute.value));
    }
  }

  if (element.localName.toLowerCase() === "style") {
    element.textContent = sanitizeCss(element.textContent ?? "");
  }
}

/**
 * Treat Mermaid's renderer as an untrusted producer. Diagram source can arrive
 * through shared documents, so only a constrained SVG subset may reach the DOM.
 */
export function sanitizeMermaidSvg(svg: string): string {
  const documentNode = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (
    documentNode.querySelector("parsererror") ||
    documentNode.documentElement.localName.toLowerCase() !== "svg"
  ) {
    throw new Error("Mermaid returned invalid SVG");
  }

  for (const elementName of BLOCKED_ELEMENTS) {
    for (const element of Array.from(
      documentNode.querySelectorAll(elementName),
    )) {
      element.remove();
    }
  }

  for (const element of Array.from(documentNode.querySelectorAll("*"))) {
    sanitizeElement(element);
  }

  return new XMLSerializer().serializeToString(documentNode.documentElement);
}
