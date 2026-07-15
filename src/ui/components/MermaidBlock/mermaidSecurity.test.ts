import { describe, expect, it } from "vitest";
import { sanitizeMermaidSvg } from "./mermaidSecurity";

describe("sanitizeMermaidSvg", () => {
  it("removes executable SVG content and external resource URLs", () => {
    const sanitized = sanitizeMermaidSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <script>alert('xss')</script>
        <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">unsafe</div></foreignObject>
        <a href="javascript:alert('xss')" onclick="alert('xss')"><text>link</text></a>
        <image href="https://tracker.example/pixel.png" />
        <rect style="fill: url(https://tracker.example/fill); stroke: url(#safe)" />
      </svg>
    `);

    expect(sanitized).not.toMatch(/script|foreignObject|onclick|javascript/i);
    expect(sanitized).not.toContain("tracker.example");
    expect(sanitized).toContain("url(#safe)");
  });

  it("keeps fragment references used by SVG markers", () => {
    const sanitized = sanitizeMermaidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><path marker-end="url(#arrow)"/><use href="#node"/></svg>',
    );

    expect(sanitized).toContain('href="#node"');
    expect(sanitized).toContain("url(#arrow)");
  });

  it("rejects non-SVG renderer output", () => {
    expect(() => sanitizeMermaidSvg("<div>not an svg</div>")).toThrow(
      "Mermaid returned invalid SVG",
    );
  });
});
