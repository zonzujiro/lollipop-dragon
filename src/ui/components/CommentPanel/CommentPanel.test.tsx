import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { CommentPanel } from "./index";
import { useAppStore } from "../../../store";
import { getActiveTab } from "../../../store/selectors";
import {
  setTestState,
  resetTestStore,
  makeComment as makeCommentBase,
} from "../../../testing/testHelpers";
import type { Comment } from "../../../types/criticmarkup";

function makeComment(
  id: string,
  type: Comment["type"],
  text: string,
  blockIndex = 0,
) {
  return makeCommentBase({ id, type, text, raw: `{>>${text}<<}`, blockIndex });
}

const comments: Comment[] = [
  makeComment("0", "clarify", "clarify the intro", 0),
  makeComment("1", "rewrite", "rewrite paragraph", 1),
  makeComment("2", "clarify", "another clarification", 2),
];

beforeEach(() => {
  resetTestStore();
  setTestState({
    comments: [],
    resolvedComments: [],
    activeCommentId: null,
    commentPanelOpen: true,
    commentFilter: "all",
  });
  vi.restoreAllMocks();
});

describe("CommentPanel — list rendering", () => {
  it("keeps comments readable and marks the rail read-only during restore", () => {
    setTestState({
      comments: [makeComment("0", "clarify", "keep this visible")],
      restoreError: 'Live access to "notes.md" is unavailable.',
    });

    render(<CommentPanel />);

    expect(screen.getByText("keep this visible")).toBeInTheDocument();
    expect(
      screen.getByText("read-only until folder access is restored"),
    ).toBeInTheDocument();
  });

  it("renders shortcut hints as individual keycaps", () => {
    const { container } = render(<CommentPanel />);
    const footer = container.querySelector(".comment-panel__shortcut-hints");
    expect(footer).not.toBeNull();
    const keycaps = Array.from(footer?.querySelectorAll("kbd") ?? []).map(
      (keycap) => keycap.textContent,
    );
    expect(keycaps).toEqual(["J", "K", "C", "⌘K"]);
  });

  it("shows empty state when there are no comments", () => {
    render(<CommentPanel />);
    expect(
      screen.getByText(/No comments in this document/),
    ).toBeInTheDocument();
  });

  it('shows all comments when filter is "all"', () => {
    setTestState({ comments });
    render(<CommentPanel />);
    expect(screen.getByText("clarify the intro")).toBeInTheDocument();
    expect(screen.getByText("rewrite paragraph")).toBeInTheDocument();
    expect(screen.getByText("another clarification")).toBeInTheDocument();
  });

  it("shows type badges for each comment", () => {
    setTestState({ comments: [makeComment("0", "fix", "some text")] });
    render(<CommentPanel />);
    expect(screen.getByText("fix")).toBeInTheDocument();
  });

  it("shows the local author instead of an implementation block reference", () => {
    setTestState({ comments: [makeComment("0", "note", "note", 3)] });
    render(<CommentPanel />);
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.queryByText("¶4")).not.toBeInTheDocument();
  });

  it("shows the total comment count", () => {
    setTestState({ comments });
    const { container } = render(<CommentPanel />);
    expect(
      container.querySelector(".comment-panel__open-count")?.textContent,
    ).toBe("3 open");
  });
});

describe("CommentPanel — filtering", () => {
  beforeEach(() => {
    setTestState({ comments });
  });

  it("shows filter buttons when multiple types are present", () => {
    render(<CommentPanel />);
    // Filter button accessible names include the count.
    expect(
      screen.getByRole("button", { name: /^All\s+\d/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^clarify\s+\d/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^rewrite\s+\d/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^fix\s+\d/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^expand\s+\d/ }),
    ).not.toBeInTheDocument();
  });

  it("filters comments by type when a filter button is clicked", async () => {
    const user = userEvent.setup();
    render(<CommentPanel />);
    await user.click(screen.getByRole("button", { name: /^clarify\s+\d/ }));
    expect(screen.getByText("clarify the intro")).toBeInTheDocument();
    expect(screen.getByText("another clarification")).toBeInTheDocument();
    expect(screen.queryByText("rewrite paragraph")).not.toBeInTheDocument();
  });

  it("falls back to All for a persisted legacy type filter", () => {
    setTestState({ commentFilter: "expand" });
    render(<CommentPanel />);
    expect(screen.getByText("clarify the intro")).toBeInTheDocument();
    expect(screen.getByText("rewrite paragraph")).toBeInTheDocument();
  });

  it("resets to all when clicking an active filter", async () => {
    const user = userEvent.setup();
    setTestState({ commentFilter: "clarify" });
    render(<CommentPanel />);
    await user.click(screen.getAllByRole("button", { name: /^clarify/ })[0]);
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.commentFilter).toBe("all");
  });
});

describe("CommentPanel — active entry", () => {
  it("marks the active comment entry", () => {
    setTestState({ comments, activeCommentId: "1" });
    const { container } = render(<CommentPanel />);
    const active = container.querySelector(".comment-panel__entry--active");
    expect(active).toBeInTheDocument();
    expect(active?.textContent).toContain("rewrite paragraph");
  });

  it("sets activeCommentId when clicking an entry", async () => {
    const user = userEvent.setup();
    setTestState({ comments });
    render(<CommentPanel />);
    await user.click(screen.getByText("clarify the intro"));
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.activeCommentId).toBe("0");
  });

  it("keeps the active comment open when clicking the active entry again", async () => {
    const user = userEvent.setup();
    setTestState({ comments, activeCommentId: "0" });
    render(<CommentPanel />);
    await user.click(screen.getByText("clarify the intro"));
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.activeCommentId).toBe("0");
  });

  it("keeps threaded replies out of the panel list and highlights the root entry", () => {
    setTestState({
      comments: [
        makeCommentBase({
          id: "question-root",
          type: "question",
          text: "Why is this here?",
          blockIndex: 0,
          thread: {
            commentId: "mr-question-1",
            threadId: "mr-question-1",
          },
        }),
        makeCommentBase({
          id: "answer-reply",
          type: "answer",
          text: "Because it explains reconnect fallback.",
          blockIndex: 0,
          thread: {
            commentId: "mr-answer-1",
            threadId: "mr-question-1",
            replyTo: "mr-question-1",
            authorLabel: "Codex",
          },
        }),
      ],
      activeCommentId: "answer-reply",
    });

    const { container } = render(<CommentPanel />);

    expect(screen.getByText("Why is this here?")).toBeInTheDocument();
    expect(screen.getByText("answered")).toBeInTheDocument();
    expect(
      screen.queryByText("Because it explains reconnect fallback."),
    ).not.toBeInTheDocument();

    const active = container.querySelector(".comment-panel__entry--active");
    expect(active?.textContent).toContain("Why is this here?");
  });

  it("does not show edit actions for agent-authored answer comments", async () => {
    const user = userEvent.setup();
    setTestState({
      comments: [
        makeCommentBase({
          id: "answer-reply",
          type: "answer",
          text: "Because it explains reconnect fallback.",
          blockIndex: 0,
          thread: {
            commentId: "mr-answer-1",
            threadId: "mr-question-1",
            replyTo: "mr-question-1",
            authorLabel: "Codex",
          },
        }),
      ],
    });

    render(<CommentPanel />);

    await user.hover(
      screen.getByText("Because it explains reconnect fallback."),
    );
    expect(
      screen.queryByRole("button", { name: "Edit comment" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete comment" }),
    ).toBeInTheDocument();
  });
});

describe("CommentPanel — prototype chrome", () => {
  it("keeps close and destructive controls out of the rail", () => {
    render(<CommentPanel />);
    expect(
      screen.queryByRole("button", { name: "Close comments panel" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clear" }),
    ).not.toBeInTheDocument();
  });
});

describe("CommentPanel — agent prompt", () => {
  it("does not show copy-prompt actions in the comments panel header", () => {
    setTestState({
      activeFilePath: "docs/spec.md",
      comments: [
        makeCommentBase({
          id: "fix-root",
          type: "fix",
          text: "Fix the intro",
        }),
      ],
    });

    render(<CommentPanel />);
    expect(
      screen.queryByRole("button", { name: "Copy review prompt" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy agent prompt" }),
    ).not.toBeInTheDocument();
  });

  it("does not show folder-level copy-prompt actions in the comments panel header", () => {
    setTestState({
      fileTree: [
        {
          kind: "file",
          name: "spec.md",
          path: "docs/spec.md",
        },
      ],
      allFileComments: {
        "docs/spec.md": {
          filePath: "docs/spec.md",
          fileName: "spec.md",
          comments: [
            makeCommentBase({
              id: "fix-root",
              type: "fix",
              text: "Fix the intro",
            }),
          ],
        },
        "docs/notes.md": {
          filePath: "docs/notes.md",
          fileName: "notes.md",
          comments: [
            makeCommentBase({
              id: "note-root",
              type: "note",
              text: "Check this claim",
            }),
          ],
        },
      },
    });

    render(<CommentPanel />);
    expect(
      screen.queryByRole("button", { name: "Copy review prompt" }),
    ).not.toBeInTheDocument();
  });

  it("does not show question-thread copy-prompt actions in the comments panel header", () => {
    setTestState({
      comments: [
        makeCommentBase({
          id: "question-root",
          type: "question",
          text: "Why is this here?",
          thread: {
            commentId: "mr-question-1",
            threadId: "mr-question-1",
          },
        }),
      ],
    });

    render(<CommentPanel />);
    expect(
      screen.queryByRole("button", { name: "Copy agent prompt" }),
    ).not.toBeInTheDocument();
  });

  it("shows and stops an active agent run for the current tab", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    setTestState({
      comments: [
        makeCommentBase({
          id: "question-root",
          type: "question",
          text: "Why is this here?",
          thread: {
            commentId: "mr-question-1",
            threadId: "mr-question-1",
          },
        }),
      ],
    });
    const run = useAppStore.getState().createAgentRun({
      tabId: "test-tab",
      taskKind: "answer_questions",
      targetPaths: ["spec.md"],
      selectedCommentIds: ["mr-question-1"],
      prompt: "Review spec.md and answer questions",
      runnerKind: "terminal",
    });
    useAppStore.getState().updateAgentRunStatus({
      runId: run.id,
      status: "running",
      terminalAttachmentId: "native-run-1",
      output: "Working on questions\n",
    });

    render(<CommentPanel />);

    expect(screen.getByText("Agent Running")).toBeInTheDocument();
    expect(
      screen.getByText("Answer questions · spec.md · 1 comment"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Working on questions/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy agent prompt" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show terminal" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Working on questions/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy prompt" }));
    expect(writeText).toHaveBeenCalledWith(
      "Review spec.md and answer questions",
    );
    expect(useAppStore.getState().toast).toBe("Agent run prompt copied");

    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(useAppStore.getState().agentRuns[run.id]?.status).toBe("stopped");
    expect(useAppStore.getState().toast).toBe("Agent run stopped");
  });

  it("shows recent finished agent runs for the current tab", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    setTestState({
      comments: [
        makeCommentBase({
          id: "fix-root",
          type: "fix",
          text: "Fix the intro",
        }),
      ],
    });
    const finishedRun = useAppStore.getState().createAgentRun({
      tabId: "test-tab",
      taskKind: "address_comments",
      targetPaths: ["spec.md"],
      selectedCommentIds: ["fix-root"],
      prompt: "Fix spec.md comments",
      runnerKind: "terminal",
    });
    useAppStore.getState().updateAgentRunStatus({
      runId: finishedRun.id,
      status: "completed",
      output: "Fixed comments\n",
    });
    const activeRun = useAppStore.getState().createAgentRun({
      tabId: "test-tab",
      taskKind: "answer_questions",
      targetPaths: ["spec.md"],
      selectedCommentIds: ["mr-question-1"],
      prompt: "Answer spec.md questions",
      runnerKind: "terminal",
    });
    useAppStore.getState().updateAgentRunStatus({
      runId: activeRun.id,
      status: "running",
      terminalAttachmentId: "native-run-1",
    });

    render(<CommentPanel />);

    const history = screen.getByLabelText("Recent agent runs");
    expect(within(history).getByText("Completed")).toBeInTheDocument();
    expect(within(history).getByText(/Address comments/)).toBeInTheDocument();

    await user.click(
      within(history).getByRole("button", { name: "Copy prompt" }),
    );
    expect(writeText).toHaveBeenCalledWith("Fix spec.md comments");
    expect(useAppStore.getState().toast).toBe("Agent run prompt copied");

    await user.click(
      within(history).getByRole("button", { name: "Copy output" }),
    );
    expect(writeText).toHaveBeenCalledWith("Fixed comments\n");
    expect(useAppStore.getState().toast).toBe("Agent run output copied");

    await user.click(within(history).getByRole("button", { name: "Dismiss" }));

    expect(useAppStore.getState().agentRuns[finishedRun.id]).toBeUndefined();
    expect(useAppStore.getState().agentRuns[activeRun.id]).toBeDefined();
  });
});

describe("CommentPanel — resolved history", () => {
  it("shows persisted resolved comments as view-only history", () => {
    setTestState({
      comments,
      resolvedComments: [
        makeCommentBase({
          id: "resolved-comment",
          type: "fix",
          text: "already removed",
        }),
      ],
      commentFilter: "resolved",
    });

    render(<CommentPanel />);

    expect(screen.queryByText("clarify the intro")).not.toBeInTheDocument();
    expect(screen.getByText("already removed")).toBeInTheDocument();
    expect(screen.getByText("resolved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Resolved 1/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit comment" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete comment" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });
});

describe("CommentPanel — selecting a comment", () => {
  it("clicking an entry makes it the active comment", async () => {
    setTestState({ comments, activeCommentId: null });
    const { container } = render(<CommentPanel />);
    expect(
      container.querySelector(".comment-panel__entry--active"),
    ).not.toBeInTheDocument();

    const entries = container.querySelectorAll(".comment-panel__entry");
    expect(entries.length).toBeGreaterThan(0);
    fireEvent.click(entries[0]);

    expect(
      container.querySelector(".comment-panel__entry--active"),
    ).toBeInTheDocument();
  });
});
