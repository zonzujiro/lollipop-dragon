import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetTestStore, setTestState } from "../../../testing/testHelpers";

const shikiMocks = vi.hoisted(() => {
  const highlighter = {
    codeToHast: vi.fn().mockReturnValue({
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
    }),
  };
  let resolveHighlighter: ((value: typeof highlighter) => void) | null = null;
  const highlighterPromise = new Promise<typeof highlighter>((resolve) => {
    resolveHighlighter = resolve;
  });

  return {
    createApplicationHighlighter: vi.fn(() => highlighterPromise),
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
  default: vi.fn(() => () => {}),
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
  });

  it("applies the Shiki rehype plugin after the highlighter is ready", async () => {
    const { default: rehypeShikiFromHighlighter } =
      await import("@shikijs/rehype/core");
    setTestState({ rawContent: "```ts\nconst count: number = 2\n```" });

    const { MarkdownRenderer } = await import("./index");
    render(<MarkdownRenderer />);

    await waitFor(() => {
      expect(rehypeShikiFromHighlighter).toHaveBeenCalled();
    });
  });
});
