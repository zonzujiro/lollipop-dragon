import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import mermaid from "mermaid";
import { MermaidBlock } from "./index";
import type { MermaidComment } from "./MermaidBlock";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { resetTestStore, setTestState } from "../../../testing/testHelpers";
import { useAppStore } from "../../../store";
import { getActiveTab } from "../../../store/selectors";

// Mock mermaid before importing the component
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

// Mock Shiki so the MarkdownRenderer integration test doesn't try to load grammars
vi.mock("shiki", () => ({
  createHighlighter: vi.fn().mockResolvedValue({}),
}));

vi.mock("@shikijs/rehype/core", () => ({
  default: vi.fn(() => () => {}),
}));

describe("MermaidBlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Keep this first: loadMermaid() memoizes, so initialize() only runs on the
  // first render in this module. Suppressing mermaid's built-in error graphic
  // stops the default "Syntax error" bomb SVG from being orphaned in <body> on
  // a parse failure — the block shows its own source + error message instead.
  it("initializes mermaid with safe SVG text labels", async () => {
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: "<svg></svg>",
      bindFunctions: undefined,
    });

    render(<MermaidBlock code="graph TD; A-->B" />);

    await waitFor(() => {
      expect(mermaid.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          htmlLabels: false,
          suppressErrorRendering: true,
        }),
      );
    });
  });

  it("renders the SVG returned by mermaid", async () => {
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: '<svg data-testid="diagram"></svg>',
      bindFunctions: undefined,
    });

    render(<MermaidBlock code="graph TD; A-->B" />);

    await waitFor(() => {
      expect(screen.getByTestId("diagram")).toBeInTheDocument();
    });
  });

  it("shows raw code and error message when mermaid fails", async () => {
    vi.mocked(mermaid.render).mockRejectedValue(
      new Error("Parse error on line 1"),
    );

    render(<MermaidBlock code="invalid diagram code" />);

    await waitFor(() => {
      expect(screen.getByText("invalid diagram code")).toBeInTheDocument();
      expect(
        screen.getByText(/Mermaid error: Parse error on line 1/),
      ).toBeInTheDocument();
    });
  });

  it("renders nothing while mermaid is still rendering", async () => {
    vi.mocked(mermaid.render).mockReturnValue(new Promise(() => {})); // never resolves

    const { container } = render(<MermaidBlock code="graph TD; A-->B" />);

    expect(container.querySelector(".mermaid-diagram svg")).toBeNull();
    expect(screen.getByRole("button", { name: "diagram" })).toBeVisible();
    expect(screen.getByRole("button", { name: "source" })).toBeVisible();
  });

  it("shows a direction toggle button for graph/flowchart diagrams", async () => {
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: "<svg></svg>",
      bindFunctions: undefined,
    });

    render(<MermaidBlock code="graph TD; A-->B" />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Switch to LR layout" }),
      ).toBeInTheDocument();
    });
  });

  it("does not show a direction button for non-directional diagrams", async () => {
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: "<svg></svg>",
      bindFunctions: undefined,
    });

    render(<MermaidBlock code="sequenceDiagram\nA->>B: Hello" />);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Switch to/ }),
      ).not.toBeInTheDocument();
    });
  });

  it("re-renders with LR direction when toggle button is clicked", async () => {
    vi.mocked(mermaid.render)
      .mockResolvedValueOnce({
        svg: '<svg data-testid="td"></svg>',
        bindFunctions: undefined,
      })
      .mockResolvedValueOnce({
        svg: '<svg data-testid="lr"></svg>',
        bindFunctions: undefined,
      });

    render(<MermaidBlock code="graph TD; A-->B" />);

    await waitFor(() => screen.getByTestId("td"));

    const [, lastCall] = vi.mocked(mermaid.render).mock.calls;
    expect(lastCall).toBeUndefined(); // only one render so far

    await userEvent.click(
      screen.getByRole("button", { name: "Switch to LR layout" }),
    );

    await waitFor(() => screen.getByTestId("lr"));

    const lrCode = vi.mocked(mermaid.render).mock.calls[1][1];
    expect(lrCode).toMatch(/graph LR/i);
  });

  it("button label flips to TD after switching to LR", async () => {
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: "<svg></svg>",
      bindFunctions: undefined,
    });

    render(<MermaidBlock code="graph TD; A-->B" />);

    await waitFor(() =>
      screen.getByRole("button", { name: "Switch to LR layout" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Switch to LR layout" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Switch to TD layout" }),
      ).toBeInTheDocument();
    });
  });

  it("resets direction override when code prop changes", async () => {
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: "<svg></svg>",
      bindFunctions: undefined,
    });

    const { rerender } = render(<MermaidBlock code="graph TD; A-->B" />);

    await waitFor(() =>
      screen.getByRole("button", { name: "Switch to LR layout" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Switch to LR layout" }),
    );
    await waitFor(() =>
      screen.getByRole("button", { name: "Switch to TD layout" }),
    );

    rerender(<MermaidBlock code="graph TD; B-->C" />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Switch to LR layout" }),
      ).toBeInTheDocument();
    });
  });

  it("re-renders when code prop changes", async () => {
    vi.mocked(mermaid.render)
      .mockResolvedValueOnce({
        svg: '<svg data-testid="first"></svg>',
        bindFunctions: undefined,
      })
      .mockResolvedValueOnce({
        svg: '<svg data-testid="second"></svg>',
        bindFunctions: undefined,
      });

    const { rerender } = render(<MermaidBlock code="graph TD; A-->B" />);

    await waitFor(() =>
      expect(screen.getByTestId("first")).toBeInTheDocument(),
    );

    rerender(<MermaidBlock code="graph TD; B-->C" />);

    await waitFor(() =>
      expect(screen.getByTestId("second")).toBeInTheDocument(),
    );
  });

  it("opens a source anchor from a rendered node", async () => {
    const onCreateAnchor = vi.fn();
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: '<svg><g class="node"><rect></rect><text class="nodeLabel">Users</text></g></svg>',
      bindFunctions: undefined,
    });

    render(
      <MermaidBlock
        code={"flowchart TD\n  A[Users]"}
        onCreateAnchor={onCreateAnchor}
      />,
    );

    const node = await screen.findByRole("button", {
      name: "Comment on Mermaid node Users",
    });
    await userEvent.click(node);

    expect(onCreateAnchor).toHaveBeenCalledWith({
      quote: "Users",
      occurrence: 1,
      start: 17,
      end: 22,
    });
  });

  it("keeps node comment rings and pins across source view toggles", async () => {
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: '<svg><g class="node"><rect></rect><text class="nodeLabel">Users</text></g></svg>',
      bindFunctions: undefined,
    });
    const comments: MermaidComment[] = [
      {
        id: "node-comment",
        type: "fix",
        authorLabel: "Ivan",
        anchor: {
          quote: "Users",
          occurrence: 1,
          start: 17,
          end: 22,
          orphaned: false,
        },
      },
    ];

    const { container } = render(
      <MermaidBlock
        code={"flowchart TD\n  A[Users]"}
        comments={comments}
        activeCommentId="node-comment"
      />,
    );

    await waitFor(() => {
      expect(
        container.querySelector('g.node[data-comment-type="fix"]'),
      ).toBeInTheDocument();
    });
    expect(
      await screen.findByRole("button", {
        name: "Select fix comment by Ivan",
      }),
    ).toHaveAttribute("data-selected", "true");

    await userEvent.click(screen.getByRole("button", { name: "source" }));
    expect(container.querySelector("code")).toHaveTextContent(
      "flowchart TD A[Users]",
    );
    await userEvent.click(screen.getByRole("button", { name: "diagram" }));

    await waitFor(() => {
      expect(
        container.querySelector('g.node[data-comment-selected="true"]'),
      ).toBeInTheDocument();
    });
    expect(
      await screen.findByRole("button", {
        name: "Select fix comment by Ivan",
      }),
    ).toHaveAttribute("data-selected", "true");
  });
});

describe("MarkdownRenderer — mermaid blocks", () => {
  beforeEach(() => {
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: '<svg data-testid="mermaid-svg"></svg>',
      bindFunctions: undefined,
    });
  });

  it("routes mermaid code blocks to MermaidBlock", async () => {
    resetTestStore();
    setTestState({
      rawContent: "```mermaid\ngraph TD; A-->B\n```",
    });

    render(<MarkdownRenderer />);

    await waitFor(() => {
      expect(screen.getByTestId("mermaid-svg")).toBeInTheDocument();
    });
  });

  it("re-attaches the same node anchor after a Mermaid label is restored", async () => {
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: '<svg><g class="node"><rect></rect><text class="nodeLabel">Users</text></g></svg>',
      bindFunctions: undefined,
    });
    const anchoredComment = '{>>fix: Rename it. @@ "Users"<<}';
    const source = `\`\`\`mermaid\nflowchart TD\n  A[Users]\n\`\`\`\n${anchoredComment}`;
    resetTestStore();
    setTestState({ rawContent: source });

    const { container } = render(<MarkdownRenderer />);
    await userEvent.click(
      await screen.findByRole("button", { name: "source" }),
    );
    await waitFor(() => {
      expect(container.querySelector(".comment-highlight")).toHaveTextContent(
        "Users",
      );
    });

    act(() => {
      setTestState({
        rawContent: source.replace("A[Users]", "A[Accounts]"),
      });
    });
    await waitFor(() => {
      expect(container.querySelector(".comment-highlight")).toBeNull();
      expect(
        getActiveTab(useAppStore.getState())?.comments[0]?.anchor?.orphaned,
      ).toBe(true);
    });

    act(() => {
      setTestState({ rawContent: source });
    });
    await waitFor(() => {
      expect(container.querySelector(".comment-highlight")).toHaveTextContent(
        "Users",
      );
      expect(
        getActiveTab(useAppStore.getState())?.comments[0]?.anchor?.orphaned,
      ).toBe(false);
    });
  });

  it("posts the same source-based Mermaid node anchor in peer mode", async () => {
    vi.mocked(mermaid.render).mockResolvedValue({
      svg: '<svg><g class="node"><rect></rect><text class="nodeLabel">Users</text></g></svg>',
      bindFunctions: undefined,
    });
    const source = "```mermaid\nflowchart TD\n  A[Users]\n```";
    resetTestStore();
    setTestState(
      {},
      {
        isPeerMode: true,
        peerName: "Marta",
        peerRawContent: source,
        peerFileName: "architecture.md",
        peerActiveFilePath: "architecture.md",
        sharedContent: {
          version: "2.0",
          created_at: new Date().toISOString(),
          tree: { "architecture.md": source },
        },
      },
    );

    render(<MarkdownRenderer />);
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Comment on Mermaid node Users",
      }),
    );
    await userEvent.type(
      await screen.findByLabelText("Comment text"),
      "Clarify this node.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(useAppStore.getState().myPeerComments[0]?.blockRef).toMatchObject({
      blockIndex: 0,
      anchorVersion: 1,
      quote: "Users",
      occurrence: 1,
    });
  });
});
