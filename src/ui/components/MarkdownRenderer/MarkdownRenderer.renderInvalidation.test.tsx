import { act, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const counters = vi.hoisted(() => ({
  commentMarginRenderCount: 0,
  reactMarkdownRenderCount: 0,
}));

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: ReactNode }) => {
    counters.reactMarkdownRenderCount += 1;
    return <div data-testid="react-markdown">{children}</div>;
  },
}));

vi.mock("../CommentMargin", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../CommentMargin")>();
  const ActualCommentMargin = actual.CommentMargin;

  return {
    ...actual,
    CommentMargin: (
      props: Parameters<typeof actual.CommentMargin>[0],
    ) => {
      counters.commentMarginRenderCount += 1;
      return <ActualCommentMargin {...props} />;
    },
  };
});

import { MarkdownRenderer } from "./index";
import { useActiveTab } from "../../../store/selectors";
import {
  makeShare,
  resetTestStore,
  setTestState,
} from "../../../testing/testHelpers";

function HostShell() {
  const tab = useActiveTab();

  return (
    <>
      <span data-testid="share-count">{tab?.shares.length ?? 0}</span>
      <MarkdownRenderer />
    </>
  );
}

beforeEach(() => {
  resetTestStore();
  counters.commentMarginRenderCount = 0;
  counters.reactMarkdownRenderCount = 0;
  setTestState({
    fileName: "doc.md",
    activeFilePath: "doc.md",
    rawContent: "# Shared doc",
    comments: [],
    writeAllowed: true,
    shares: [],
    shareKeys: {},
    activeDocId: null,
  });
});

describe("MarkdownRenderer render invalidation", () => {
  it("does not rerender markdown when only share metadata changes", async () => {
    render(<HostShell />);

    expect(screen.getByTestId("react-markdown")).toHaveTextContent(
      "# Shared doc",
    );
    expect(counters.reactMarkdownRenderCount).toBe(1);
    const commentMarginRenderCount = counters.commentMarginRenderCount;
    expect(commentMarginRenderCount).toBeGreaterThan(0);

    act(() => {
      setTestState({
        shares: [makeShare({ docId: "doc-2", sharedPaths: ["doc.md"] })],
        activeDocId: "doc-2",
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("share-count")).toHaveTextContent("1");
    });
    expect(counters.reactMarkdownRenderCount).toBe(1);
    expect(counters.commentMarginRenderCount).toBe(commentMarginRenderCount);
  });
});
