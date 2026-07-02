import { render, screen } from "@testing-library/react";
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

  it("edits the selected thread message", async () => {
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

    await user.click(
      screen.getAllByRole("button", { name: "Edit comment" })[1],
    );
    const textarea = screen.getByDisplayValue(
      "It explains the reconnect fallback path.",
    );
    await user.clear(textarea);
    await user.type(textarea, "Updated answer.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onEdit).toHaveBeenCalledWith(
      "reply-comment",
      "answer",
      "Updated answer.",
    );
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
});
