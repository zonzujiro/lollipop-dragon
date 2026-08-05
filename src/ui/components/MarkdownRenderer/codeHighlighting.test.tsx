import { act, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetTestStore, setTestState } from "../../../testing/testHelpers";

interface TestHastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: TestHastNode[];
  value?: string;
}

interface TestHastRoot extends TestHastNode {
  children: TestHastNode[];
}

const shikiMocks = vi.hoisted(() => {
  function buildHighlightedCodeTree(): TestHastRoot {
    return {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "pre",
          properties: { className: ["shiki", "github-light"] },
          children: [
            {
              type: "element",
              tagName: "code",
              properties: {},
              children: [{ type: "text", value: "const value = 1" }],
            },
          ],
        },
      ],
    };
  }
  const highlighter = {
    codeToHast: vi.fn(buildHighlightedCodeTree),
  };
  const transformCodeBlocks = (tree: TestHastRoot) => {
    tree.children = tree.children.map((node) => {
      if (node.type === "element" && node.tagName === "pre") {
        return highlighter.codeToHast();
      }
      return node;
    });
  };
  let resolveHighlighter: ((value: typeof highlighter) => void) | null = null;
  const highlighterPromise = new Promise<typeof highlighter>((resolve) => {
    resolveHighlighter = resolve;
  });

  return {
    createApplicationHighlighter: vi.fn(() => highlighterPromise),
    transformCodeBlocks,
    resolve() {
      if (!resolveHighlighter) {
        throw new Error("Shiki test promise was not initialized");
      }
      resolveHighlighter(highlighter);
    },
  };
});

vi.mock("../../../markup/createShikiHighlighter", () => ({
  createApplicationHighlighter: shikiMocks.createApplicationHighlighter,
}));

vi.mock("@shikijs/rehype/core", () => ({
  default: vi.fn(() => shikiMocks.transformCodeBlocks),
}));

beforeEach(() => {
  resetTestStore();
  setTestState({ fileHandle: null, fileName: null, rawContent: "" });
  vi.clearAllMocks();
});

describe("MarkdownRenderer — Shiki integration", () => {
  it("loads Shiki lazily while rendering plain code during startup", async () => {
    setTestState({ rawContent: "```js\nconst value = 1\n```" });

    const { MarkdownRenderer } = await import("./index");
    render(<MarkdownRenderer />);

    expect(screen.getByText("const value = 1")).toBeInTheDocument();
    await waitFor(() => {
      expect(shikiMocks.createApplicationHighlighter).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      shikiMocks.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Comment on line 1" }),
      ).toBeInTheDocument();
    });
  });

  it("applies the Shiki rehype plugin after the highlighter is ready", async () => {
    const { default: rehypeShikiFromHighlighter } =
      await import("@shikijs/rehype/core");
    setTestState({ rawContent: "```ts\nconst count: number = 2\n```" });

    const { MarkdownRenderer } = await import("./index");
    render(<MarkdownRenderer />);

    await waitFor(() => {
      expect(rehypeShikiFromHighlighter).toHaveBeenCalledWith(
        expect.anything(),
        {
          themes: { light: "github-light", dark: "github-dark" },
          defaultColor: false,
          missingLang: "ignore",
        },
      );
    });
  });

  it("uses Shiki's dark token colors inside dark code surfaces", () => {
    const codeSurfaceCss = readFileSync(
      "src/ui/components/CodeCommentSurface/CodeCommentSurface.css",
      "utf8",
    );

    expect(codeSurfaceCss).toContain(
      ".dark .code-comment-surface__pre code span",
    );
    expect(codeSurfaceCss).toContain("color: var(--shiki-light, inherit)");
    expect(codeSurfaceCss).toContain("color: var(--shiki-dark, inherit)");
  });
});
