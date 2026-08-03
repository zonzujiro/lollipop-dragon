import mermaid from "mermaid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sanitizeMermaidSvg } from "./mermaidSecurity";

const getBBoxDescriptor = Object.getOwnPropertyDescriptor(
  SVGElement.prototype,
  "getBBox",
);
const getComputedTextLengthDescriptor = Object.getOwnPropertyDescriptor(
  SVGElement.prototype,
  "getComputedTextLength",
);

function restoreSvgMethod(
  methodName: string,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(SVGElement.prototype, methodName, descriptor);
    return;
  }
  Reflect.deleteProperty(SVGElement.prototype, methodName);
}

describe("Mermaid SVG rendering", () => {
  beforeAll(() => {
    Object.defineProperty(SVGElement.prototype, "getBBox", {
      configurable: true,
      value: () => new DOMRect(0, 0, 100, 20),
    });
    Object.defineProperty(SVGElement.prototype, "getComputedTextLength", {
      configurable: true,
      value: () => 100,
    });
  });

  afterAll(() => {
    restoreSvgMethod("getBBox", getBBoxDescriptor);
    restoreSvgMethod("getComputedTextLength", getComputedTextLengthDescriptor);
  });

  it("keeps flowchart node labels after sanitization", async () => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      htmlLabels: false,
      flowchart: {
        htmlLabels: false,
      },
    });

    const { svg } = await mermaid.render(
      "visible-node-labels",
      "flowchart LR\n  Start[Start] --> Choice{Existing?}\n  Choice -->|Generate new| Generate[Generate]",
    );
    const sanitized = sanitizeMermaidSvg(svg);
    const svgDocument = new DOMParser().parseFromString(
      sanitized,
      "image/svg+xml",
    );
    const nodeLabels = Array.from(
      svgDocument.querySelectorAll("g.node text"),
      (label) => label.textContent,
    );
    const edgeLabels = Array.from(
      svgDocument.querySelectorAll("g.edgeLabel text"),
      (label) => label.textContent ?? "",
    ).filter((label) => label.length > 0);

    expect(sanitized).not.toContain("foreignObject");
    expect(nodeLabels).toEqual(["Start", "Existing?", "Generate"]);
    expect(edgeLabels).toEqual(["Generate new"]);
  });
});
