import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommentThreadCard } from "./index";
import { makeComment } from "../../../testing/testHelpers";

function makeQuestionThread() {
  const root = makeComment({
    id: "root-comment",
    type: "question",
    text: "Why is this section needed?",
    thread: {
      commentId: "mr-question-1",
      threadId: "mr-question-1",
    },
  });
  const reply = makeComment({
    id: "reply-comment",
    type: "answer",
    text: "It explains the reconnect fallback path.",
    thread: {
      commentId: "mr-answer-1",
      threadId: "mr-question-1",
      replyTo: "mr-question-1",
      authorLabel: "Codex",
    },
  });

  return {
    root,
    reply,
    thread: { root, replies: [reply] },
  };
}

function makeUnansweredQuestionThread() {
  const { root } = makeQuestionThread();
  return { root, replies: [] };
}

function makeUnansweredActionThread() {
  const { root } = makeQuestionThread();
  const reply = makeComment({
    id: "reply-comment",
    type: "clarify",
    text: "Please explain the reconnect fallback path.",
    thread: {
      commentId: "mr-action-1",
      threadId: "mr-question-1",
      replyTo: "mr-question-1",
      authorLabel: "You",
    },
  });
  return { root, replies: [reply] };
}

function makeExternalUnansweredActionThread() {
  const { root } = makeQuestionThread();
  const reply = makeComment({
    id: "external-reply-comment",
    type: "clarify",
    text: "Please explain the reconnect fallback path.",
    thread: {
      commentId: "mr-external-action-1",
      threadId: "mr-question-1",
      replyTo: "mr-question-1",
      authorLabel: "Codex",
    },
  });
  return { root, replies: [reply] };
}

describe("CommentThreadCard", () => {
  it("renders a question with linked agent answers", () => {
    render(
      <CommentThreadCard
        thread={makeQuestionThread().thread}
        top={0}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Thread")).toBeInTheDocument();
    expect(screen.getByText("Why is this section needed?")).toBeInTheDocument();
    expect(
      screen.getByText("It explains the reconnect fallback path."),
    ).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
  });

  it("uses the prototype rail anatomy for inline threads", () => {
    const { container } = render(
      <CommentThreadCard
        thread={makeQuestionThread().thread}
        top={0}
        inline
        selected
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.queryByText("Thread")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close comment" }),
    ).not.toBeInTheDocument();
    const answeredStatus = screen.getByText("✓ answered · 1");
    const resolveAction = screen.getByRole("button", {
      name: "Resolve question",
    });
    const trailingSlot = answeredStatus.closest(
      ".comment-thread-card__trailing",
    );

    expect(trailingSlot).toBeInTheDocument();
    expect(resolveAction.closest(".comment-thread-card__trailing")).toBe(
      trailingSlot,
    );
    expect(
      container.querySelector(".comment-thread-card__thread-list"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".comment-thread-card__avatar--external"),
    ).toHaveTextContent("A");
  });

  it("falls back to Agent when an answer has no author label", () => {
    const { root, reply } = makeQuestionThread();

    render(
      <CommentThreadCard
        thread={{
          root,
          replies: [
            {
              ...reply,
              thread: {
                commentId: "mr-answer-1",
                threadId: "mr-question-1",
                replyTo: "mr-question-1",
              },
            },
          ],
        }}
        top={0}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it("visually distinguishes user-authored answers from external answers", () => {
    const { root, reply } = makeQuestionThread();
    const userReply = makeComment({
      id: "user-reply-comment",
      type: "answer",
      text: "I think we can remove this section.",
      thread: {
        commentId: "mr-answer-2",
        threadId: "mr-question-1",
        replyTo: "mr-question-1",
        authorLabel: "You",
      },
    });

    render(
      <CommentThreadCard
        thread={{ root, replies: [reply, userReply] }}
        top={0}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Codex").closest(".comment-thread-card__item"),
    ).toHaveClass("comment-thread-card__item--external");
    expect(
      screen
        .getAllByText("You")
        .find((element) =>
          element.classList.contains("comment-thread-card__reply-author"),
        )
        ?.closest(".comment-thread-card__item"),
    ).toHaveClass("comment-thread-card__item--mine");
  });

  it("collapses long threads to the first and last reply", async () => {
    const user = userEvent.setup();
    const { root } = makeQuestionThread();
    const replies = ["First", "Second", "Third", "Fourth", "Last"].map(
      (text, replyIndex) =>
        makeComment({
          id: `reply-${replyIndex}`,
          type: "answer",
          text,
          thread: {
            commentId: `mr-answer-${replyIndex}`,
            threadId: "mr-question-1",
            replyTo: "mr-question-1",
            authorLabel: "Agent",
          },
        }),
    );

    render(
      <CommentThreadCard
        thread={{ root, replies }}
        top={0}
        inline
        selected={false}
      />,
    );

    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Last")).toBeInTheDocument();
    expect(screen.queryByText("Second")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "⌄ 3 more replies" }));

    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("Third")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "⌃ collapse thread" }),
    ).toBeInTheDocument();
  });

  it("changes the type while editing a user-authored thread message", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();

    render(
      <CommentThreadCard
        thread={makeUnansweredQuestionThread()}
        top={0}
        onClose={vi.fn()}
        onEdit={onEdit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit comment" }));
    const textarea = screen.getByDisplayValue("Why is this section needed?");
    await user.click(screen.getByRole("button", { name: "rewrite" }));
    await user.clear(textarea);
    await user.type(textarea, "Updated question.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onEdit).toHaveBeenCalledWith(
      "root-comment",
      "rewrite",
      "Updated question.",
    );
  });

  it("hides the answer composer while editing a thread comment", async () => {
    const user = userEvent.setup();

    render(
      <CommentThreadCard
        thread={makeUnansweredQuestionThread()}
        top={0}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onReply={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Answer text")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit comment" }));

    expect(screen.queryByLabelText("Answer text")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Send reply" }),
    ).not.toBeInTheDocument();
  });

  it("keeps only root resolution available in an answered thread", () => {
    render(
      <CommentThreadCard
        thread={makeQuestionThread().thread}
        top={0}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onReply={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Edit comment" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete comment" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Resolve question" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Answer text")).toBeInTheDocument();
  });

  it("closes an active edit when the thread becomes answered", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CommentThreadCard
        thread={makeUnansweredQuestionThread()}
        top={0}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onReply={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit comment" }));
    expect(screen.getByLabelText("Comment text")).toBeInTheDocument();

    rerender(
      <CommentThreadCard
        thread={makeQuestionThread().thread}
        top={0}
        onClose={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onReply={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Comment text")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Answer text")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete comment" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Resolve question" }),
    ).toBeInTheDocument();
  });

  it("deletes the selected thread message", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(
      <CommentThreadCard
        thread={makeUnansweredActionThread()}
        top={0}
        onClose={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete comment" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    expect(onDelete).toHaveBeenCalledWith("reply-comment");
  });

  it("does not allow deleting an external reply in an unanswered thread", () => {
    render(
      <CommentThreadCard
        thread={makeExternalUnansweredActionThread()}
        top={0}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete comment" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Resolve question" }),
    ).toBeInTheDocument();
  });

  it("resolves an answered question from the thread root", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(
      <CommentThreadCard
        thread={makeQuestionThread().thread}
        top={0}
        onClose={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Resolve question" }));

    expect(screen.getByText("Resolve this question?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm resolve" }));
    expect(onDelete).toHaveBeenCalledWith("root-comment");
  });

  it("submits a user answer from the thread composer", async () => {
    const user = userEvent.setup();
    const onReply = vi.fn();

    render(
      <CommentThreadCard
        thread={makeQuestionThread().thread}
        top={0}
        onClose={vi.fn()}
        onReply={onReply}
      />,
    );

    const input = screen.getByLabelText("Answer text");
    await user.type(input, "This is my answer.");
    await user.click(screen.getByRole("button", { name: "Send reply" }));

    expect(onReply).toHaveBeenCalledWith(
      "root-comment",
      "This is my answer.",
      "answer",
    );
    expect(input).toHaveValue("");
  });

  it("uses reply behavior when no action is selected", () => {
    render(
      <CommentThreadCard
        thread={makeQuestionThread().thread}
        top={0}
        onClose={vi.fn()}
        onReply={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Reply" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Action" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Answer text")).toHaveAttribute(
      "placeholder",
      "Reply — Enter to send",
    );
    for (const actionType of ["clarify", "rewrite"]) {
      expect(screen.getByRole("button", { name: actionType })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
    expect(
      screen.queryByRole("button", { name: "fix" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "expand" }),
    ).not.toBeInTheDocument();
  });

  it("submits a typed action from the thread composer", async () => {
    const user = userEvent.setup();
    const onReply = vi.fn();

    render(
      <CommentThreadCard
        thread={makeQuestionThread().thread}
        top={0}
        onClose={vi.fn()}
        onReply={onReply}
      />,
    );

    const clarifyButton = screen.getByRole("button", { name: "clarify" });
    await user.click(clarifyButton);
    expect(clarifyButton).toHaveAttribute("aria-pressed", "true");
    const input = screen.getByLabelText("Answer text");
    expect(input).toHaveAttribute(
      "placeholder",
      "Tell agent what to change...",
    );
    await user.type(input, "Explain BL-2.");
    await user.click(screen.getByRole("button", { name: "Apply action" }));

    expect(onReply).toHaveBeenCalledWith(
      "root-comment",
      "Explain BL-2.",
      "clarify",
    );
    expect(input).toHaveValue("");
  });

  it("returns to reply behavior when the selected action is pressed again", async () => {
    const user = userEvent.setup();
    const onReply = vi.fn();

    render(
      <CommentThreadCard
        thread={makeQuestionThread().thread}
        top={0}
        onClose={vi.fn()}
        onReply={onReply}
      />,
    );

    const rewriteButton = screen.getByRole("button", { name: "rewrite" });
    await user.click(rewriteButton);
    await user.click(rewriteButton);

    expect(rewriteButton).toHaveAttribute("aria-pressed", "false");
    const input = screen.getByLabelText("Answer text");
    expect(input).toHaveAttribute("placeholder", "Reply — Enter to send");
    await user.type(input, "Keep it after all.");
    await user.click(screen.getByRole("button", { name: "Send reply" }));

    expect(onReply).toHaveBeenCalledWith(
      "root-comment",
      "Keep it after all.",
      "answer",
    );
  });

  it("keeps send disabled until the answer has text", async () => {
    const user = userEvent.setup();

    render(
      <CommentThreadCard
        thread={makeQuestionThread().thread}
        top={0}
        onClose={vi.fn()}
        onReply={vi.fn()}
      />,
    );

    const sendButton = screen.getByRole("button", { name: "Send reply" });
    expect(sendButton).toBeDisabled();

    await user.type(screen.getByLabelText("Answer text"), "ok");

    expect(sendButton).toBeEnabled();
  });

  it("starts the reply composer at three rows with an in-field send control", () => {
    render(
      <CommentThreadCard
        thread={makeQuestionThread().thread}
        top={0}
        onClose={vi.fn()}
        onReply={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Answer text")).toHaveAttribute("rows", "3");
    expect(
      screen.getByRole("button", { name: "Send reply" }),
    ).toHaveTextContent("↑");
  });

  it("submits with Enter and keeps Shift+Enter available for a new line", async () => {
    const user = userEvent.setup();
    const onReply = vi.fn();

    render(
      <CommentThreadCard
        thread={makeQuestionThread().thread}
        top={0}
        onClose={vi.fn()}
        onReply={onReply}
      />,
    );

    const input = screen.getByLabelText("Answer text");
    await user.type(input, "First line");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onReply).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onReply).toHaveBeenCalledWith(
      "root-comment",
      "First line",
      "answer",
    );
  });
});
