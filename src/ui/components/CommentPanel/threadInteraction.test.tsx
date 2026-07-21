import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { CommentPanel } from "./index";
import { resetTestStore, setTestState } from "../../../testing/testHelpers";
import { useAppStore } from "../../../store";
import { getActiveTab } from "../../../store/selectors";
import { extractComments } from "../../../markup";

vi.mock("shiki", () => ({ createHighlighter: vi.fn().mockResolvedValue({}) }));
vi.mock("@shikijs/rehype/core", () => ({ default: vi.fn(() => () => {}) }));

// A folder document whose second sentence carries a nested question thread
// (question → agent answer → user follow-up) plus a standalone clarify comment.
const RAW = `# Doc

Intro with a {==key phrase==}{>>question: Why is this here? [markreview id="mr-q1" thread="mr-q1"]<<}{>>answer: Because reasons. [markreview id="mr-a1" thread="mr-q1" replyTo="mr-q1" author="Agent"]<<}{>>answer: Please state that explicitly. [markreview id="mr-a2" thread="mr-q1" replyTo="mr-a1" author="You"]<<} and more text.

Another {==spot==}{>>clarify: please clarify this<<} in the second paragraph.
`;
const COMMENTS = extractComments(RAW);

beforeEach(() => {
  resetTestStore();
  setTestState({
    rawContent: RAW,
    activeFilePath: "doc.md",
    fileName: "doc.md",
    comments: COMMENTS,
    commentPanelOpen: true,
    fileTree: [{ kind: "file", name: "doc.md", path: "doc.md" }],
    allFileComments: {
      "doc.md": {
        filePath: "doc.md",
        fileName: "doc.md",
        comments: COMMENTS,
      },
    },
  });
});

function renderDocAndPanel() {
  return render(
    <>
      <MarkdownRenderer />
      <CommentPanel />
    </>,
  );
}

describe("comment panel thread interaction (host mode)", () => {
  it("keeps a comment selected when clicking its panel entry", async () => {
    renderDocAndPanel();
    const entry = await waitFor(() => screen.getByText("Why is this here?"));

    await userEvent.click(entry);

    // Regression: a document-level dismiss handler used to clear the selection
    // the instant a panel entry set it (React handler runs before the document
    // listener), so the active comment never stuck.
    expect(
      getActiveTab(useAppStore.getState())?.activeCommentId,
    ).not.toBeNull();
  });

  it("expands the selected question into its nested folder-mode conversation", async () => {
    renderDocAndPanel();
    const entry = await waitFor(() => screen.getByText("Why is this here?"));

    expect(screen.getByText("Because reasons.")).toBeInTheDocument();
    expect(
      screen.getByText("Please state that explicitly."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Answer text")).not.toBeInTheDocument();

    await userEvent.click(entry);

    await waitFor(() => {
      expect(screen.getByText("Because reasons.")).toBeInTheDocument();
      expect(
        screen.getByText("Please state that explicitly."),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("Thread")).not.toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByLabelText("Answer text")).toBeInTheDocument();
  });

  it("keeps the question filter visible and functional in folder mode", async () => {
    const user = userEvent.setup();
    renderDocAndPanel();

    const questionFilter = await screen.findByRole("button", {
      name: /^question\s+\d/,
    });
    await user.click(questionFilter);

    expect(screen.getByText("Why is this here?")).toBeInTheDocument();
    expect(screen.queryByText("please clarify this")).not.toBeInTheDocument();
  });
});
