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
      screen.getByText("You").closest(".comment-thread-card__item"),
    ).toHaveClass("comment-thread-card__item--mine");
  });

  it("edits the selected user-authored thread message", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();

    render(
      <CommentThreadCard
        thread={makeQuestionThread().thread}
        top={0}
        onClose={vi.fn()}
        onEdit={onEdit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Edit comment" }));
    const textarea = screen.getByDisplayValue("Why is this section needed?");
    await user.clear(textarea);
    await user.type(textarea, "Updated question.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onEdit).toHaveBeenCalledWith(
      "root-comment",
      "question",
      "Updated question.",
    );
  });

  it("hides the answer composer while editing a thread comment", async () => {
    const user = userEvent.setup();

    render(
      <CommentThreadCard
        thread={makeQuestionThread().thread}
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

  it("does not allow editing linked agent answers", () => {
    render(
      <CommentThreadCard
        thread={makeQuestionThread().thread}
        top={0}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(
      screen.getAllByRole("button", { name: "Edit comment" }),
    ).toHaveLength(1);
  });

  it("deletes the selected thread message", async () => {
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

    await user.click(
      screen.getAllByRole("button", { name: "Delete comment" })[1],
    );
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    expect(onDelete).toHaveBeenCalledWith("reply-comment");
  });

  it("labels root deletion as deleting the thread", async () => {
    const user = userEvent.setup();

    render(
      <CommentThreadCard
        thread={makeQuestionThread().thread}
        top={0}
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    await user.click(
      screen.getAllByRole("button", { name: "Delete comment" })[0],
    );

    expect(screen.getByText("Delete this thread?")).toBeInTheDocument();
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
      "Write an answer...",
    );
    for (const actionType of [
      "fix",
      "rewrite",
      "expand",
      "clarify",
      "remove",
    ]) {
      expect(screen.getByRole("button", { name: actionType })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
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

    const removeButton = screen.getByRole("button", { name: "remove" });
    await user.click(removeButton);
    await user.click(removeButton);

    expect(removeButton).toHaveAttribute("aria-pressed", "false");
    const input = screen.getByLabelText("Answer text");
    expect(input).toHaveAttribute("placeholder", "Write an answer...");
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

  it("renders a compact one-row composer with an in-field send control", () => {
    render(
      <CommentThreadCard
        thread={makeQuestionThread().thread}
        top={0}
        onClose={vi.fn()}
        onReply={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Answer text")).toHaveAttribute("rows", "1");
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
