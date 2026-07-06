import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { CommentMargin } from "./index";
import { useAppStore } from "../../../store";
import {
  makeComment,
  setTestState,
  resetTestStore,
} from "../../../testing/testHelpers";

beforeEach(() => {
  resetTestStore();
  setTestState({
    comments: [],
    commentFilter: "all",
    activeCommentId: null,
  });
  vi.restoreAllMocks();
});

const fakeContainerRef: React.RefObject<HTMLDivElement | null> = {
  current: null,
};

function createContainerRef(blockTops: number[]) {
  const scrollArea = document.createElement("div");
  Object.defineProperty(scrollArea, "scrollTop", {
    value: 0,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(scrollArea, "clientHeight", {
    value: 640,
    configurable: true,
  });

  const container = document.createElement("div");
  for (const [blockIndex, blockTop] of blockTops.entries()) {
    const block = document.createElement("p");
    block.setAttribute("data-block-index", String(blockIndex));
    Object.defineProperty(block, "offsetTop", {
      value: blockTop,
      configurable: true,
    });
    container.appendChild(block);
  }
  scrollArea.appendChild(container);

  const containerRef: React.RefObject<HTMLDivElement | null> = {
    current: container,
  };
  return containerRef;
}

function dispatchPointerMove(clientX: number, clientY: number) {
  const event = new Event("pointermove");
  Object.defineProperty(event, "clientX", {
    value: clientX,
    configurable: true,
  });
  Object.defineProperty(event, "clientY", {
    value: clientY,
    configurable: true,
  });
  window.dispatchEvent(event);
}

function dispatchPointerDown(
  element: HTMLElement,
  clientX: number,
  clientY: number,
) {
  const event = new Event("pointerdown", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "button", {
    value: 0,
    configurable: true,
  });
  Object.defineProperty(event, "clientX", {
    value: clientX,
    configurable: true,
  });
  Object.defineProperty(event, "clientY", {
    value: clientY,
    configurable: true,
  });
  element.dispatchEvent(event);
}

describe("CommentMargin — add button", () => {
  it("shows the add button when hoveredBlock is provided", () => {
    render(
      <CommentMargin
        containerRef={fakeContainerRef}
        hoveredBlock={{ index: 0, top: 0 }}
        onAddComment={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Add comment" }),
    ).toBeInTheDocument();
  });

  it("does not show the add button when hoveredBlock is null", () => {
    render(
      <CommentMargin
        containerRef={fakeContainerRef}
        hoveredBlock={null}
        onAddComment={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Add comment" }),
    ).not.toBeInTheDocument();
  });

  it("shows the AddCommentForm after clicking the add button", async () => {
    const user = userEvent.setup();
    render(
      <CommentMargin
        containerRef={fakeContainerRef}
        hoveredBlock={{ index: 0, top: 0 }}
        onAddComment={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add comment" }));
    expect(screen.getByPlaceholderText("Add a comment…")).toBeInTheDocument();
  });

  it("hides the add button while the form is open", async () => {
    const user = userEvent.setup();
    render(
      <CommentMargin
        containerRef={fakeContainerRef}
        hoveredBlock={{ index: 0, top: 0 }}
        onAddComment={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add comment" }));
    expect(
      screen.queryByRole("button", { name: "Add comment" }),
    ).not.toBeInTheDocument();
  });

  it("hides the add button in peer mode when content refresh is required", () => {
    useAppStore.setState({ documentUpdateAvailable: true });
    render(
      <CommentMargin
        containerRef={fakeContainerRef}
        hoveredBlock={{ index: 0, top: 0 }}
        onAddComment={vi.fn()}
        peerMode
        onPostPeerComment={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Add comment" }),
    ).not.toBeInTheDocument();
  });
});

describe("CommentMargin — AddCommentForm", () => {
  async function openForm(onAddComment = vi.fn()) {
    const user = userEvent.setup();
    render(
      <CommentMargin
        containerRef={fakeContainerRef}
        hoveredBlock={{ index: 2, top: 0 }}
        onAddComment={onAddComment}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add comment" }));
    return { user, onAddComment };
  }

  it("Save button is disabled when text is empty", async () => {
    await openForm();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("Save button enables after typing text", async () => {
    const { user } = await openForm();
    await user.type(screen.getByPlaceholderText("Add a comment…"), "hello");
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("calls onAddComment with blockIndex, type, and text on submit", async () => {
    const onAddComment = vi.fn();
    const { user } = await openForm(onAddComment);
    await user.type(
      screen.getByPlaceholderText("Add a comment…"),
      "fix this please",
    );
    // Select 'fix' type
    await user.click(screen.getByRole("button", { name: "fix" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onAddComment).toHaveBeenCalledWith(2, "fix", "fix this please");
  });

  it('defaults to "note" type if no type is selected', async () => {
    const onAddComment = vi.fn();
    const { user } = await openForm(onAddComment);
    await user.type(screen.getByPlaceholderText("Add a comment…"), "a note");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onAddComment).toHaveBeenCalledWith(2, "note", "a note");
  });

  it("hides the form when Cancel is clicked", async () => {
    const { user } = await openForm();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByPlaceholderText("Add a comment…"),
    ).not.toBeInTheDocument();
  });

  it("hides the form after successful submit", async () => {
    const { user } = await openForm();
    await user.type(screen.getByPlaceholderText("Add a comment…"), "done");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      screen.queryByPlaceholderText("Add a comment…"),
    ).not.toBeInTheDocument();
  });

  it("disables saving a peer draft after the document becomes stale", async () => {
    const user = userEvent.setup();
    useAppStore.setState({ isPeerMode: true });
    const { rerender } = render(
      <CommentMargin
        containerRef={fakeContainerRef}
        hoveredBlock={{ index: 2, top: 0 }}
        onAddComment={vi.fn()}
        peerMode
        onPostPeerComment={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add comment" }));
    await user.type(screen.getByPlaceholderText("Add a comment…"), "draft");

    useAppStore.setState({ documentUpdateAvailable: true });
    rerender(
      <CommentMargin
        containerRef={fakeContainerRef}
        hoveredBlock={{ index: 2, top: 0 }}
        onAddComment={vi.fn()}
        peerMode
        onPostPeerComment={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("drags the add-comment form around the viewport", async () => {
    const { user } = await openForm();

    act(() => {
      dispatchPointerDown(screen.getByTitle("Drag comment panel"), 20, 20);
    });
    await waitFor(() => {
      const form = screen
        .getByPlaceholderText("Add a comment…")
        .closest(".comment-add-form");
      expect(form).not.toBeNull();
      if (form) {
        expect(form).toHaveClass("comment-add-form--dragging");
      }
    });
    act(() => {
      dispatchPointerMove(140, 180);
    });
    fireEvent.pointerUp(window);

    const form = screen
      .getByPlaceholderText("Add a comment…")
      .closest(".comment-add-form");
    expect(form).not.toBeNull();
    if (form) {
      expect(form).toHaveStyle({
        position: "fixed",
        left: "120px",
        top: "160px",
      });
    }

    await user.type(screen.getByPlaceholderText("Add a comment…"), "still ok");
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("closes the active comment card when the add form opens", async () => {
    const user = userEvent.setup();
    setTestState({
      activeCommentId: "fix-root",
      comments: [
        makeComment({
          id: "fix-root",
          type: "fix",
          text: "Fix this paragraph",
          blockIndex: 0,
        }),
      ],
    });

    render(
      <CommentMargin
        containerRef={createContainerRef([96])}
        hoveredBlock={{ index: 1, top: 180 }}
        onAddComment={vi.fn()}
      />,
    );

    expect(await screen.findByText("Fix this paragraph")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add comment" }));

    expect(screen.getByPlaceholderText("Add a comment…")).toBeInTheDocument();
    expect(screen.queryByText("Fix this paragraph")).not.toBeInTheDocument();
  });

  it("keeps the add button visible alongside existing comment dots", () => {
    setTestState({
      activeCommentId: "fix-root",
      comments: [
        makeComment({
          id: "fix-root",
          type: "fix",
          text: "Fix this paragraph",
          blockIndex: 0,
        }),
      ],
    });

    render(
      <CommentMargin
        containerRef={createContainerRef([96])}
        hoveredBlock={{ index: 0, top: 96 }}
        onAddComment={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Add comment" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /fix: Fix this paragraph/i }),
    ).toBeInTheDocument();
  });

  it("closes the add form when an existing comment opens", async () => {
    const user = userEvent.setup();
    setTestState({
      comments: [
        makeComment({
          id: "fix-root",
          type: "fix",
          text: "Fix this paragraph",
          blockIndex: 0,
        }),
      ],
    });

    render(
      <CommentMargin
        containerRef={createContainerRef([96])}
        hoveredBlock={{ index: 1, top: 180 }}
        onAddComment={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add comment" }));
    expect(screen.getByPlaceholderText("Add a comment…")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /fix:/i }));

    expect(
      screen.queryByPlaceholderText("Add a comment…"),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Fix this paragraph")).toBeInTheDocument();
  });
});

describe("CommentMargin — floating comment card", () => {
  it("opens the floating card for the active comment", async () => {
    setTestState({
      activeCommentId: "fix-root",
      comments: [
        makeComment({
          id: "fix-root",
          type: "fix",
          text: "Fix this paragraph",
          blockIndex: 0,
        }),
      ],
    });

    render(
      <CommentMargin
        containerRef={createContainerRef([96])}
        hoveredBlock={null}
        onAddComment={vi.fn()}
      />,
    );

    expect(await screen.findByText("Fix this paragraph")).toBeInTheDocument();
  });

  it("drags the floating card around the viewport", async () => {
    setTestState({
      activeCommentId: "fix-root",
      comments: [
        makeComment({
          id: "fix-root",
          type: "fix",
          text: "Fix this paragraph",
          blockIndex: 0,
        }),
      ],
    });

    render(
      <CommentMargin
        containerRef={createContainerRef([96])}
        hoveredBlock={null}
        onAddComment={vi.fn()}
      />,
    );

    await screen.findByText("Fix this paragraph");
    act(() => {
      dispatchPointerDown(screen.getByTitle("Drag comment panel"), 20, 20);
    });
    await waitFor(() => {
      const card = screen
        .getByText("Fix this paragraph")
        .closest(".comment-thread-card");
      expect(card).not.toBeNull();
      if (card) {
        expect(card).toHaveClass("comment-thread-card--dragging");
      }
    });
    act(() => {
      dispatchPointerMove(140, 180);
    });
    fireEvent.pointerUp(window);

    const card = screen
      .getByText("Fix this paragraph")
      .closest(".comment-thread-card");
    expect(card).not.toBeNull();
    if (card) {
      expect(card).toHaveStyle({
        position: "fixed",
        left: "120px",
        top: "160px",
      });
    }
  });

  it("resets the dragged position when another comment opens", async () => {
    setTestState({
      activeCommentId: "fix-root",
      comments: [
        makeComment({
          id: "fix-root",
          type: "fix",
          text: "Fix this paragraph",
          blockIndex: 0,
        }),
        makeComment({
          id: "note-root",
          type: "note",
          text: "Check this paragraph",
          blockIndex: 1,
        }),
      ],
    });

    render(
      <CommentMargin
        containerRef={createContainerRef([96, 180])}
        hoveredBlock={null}
        onAddComment={vi.fn()}
      />,
    );

    await screen.findByText("Fix this paragraph");
    act(() => {
      dispatchPointerDown(screen.getByTitle("Drag comment panel"), 20, 20);
    });
    await waitFor(() => {
      const card = screen
        .getByText("Fix this paragraph")
        .closest(".comment-thread-card");
      expect(card).not.toBeNull();
      if (card) {
        expect(card).toHaveClass("comment-thread-card--dragging");
      }
    });
    act(() => {
      dispatchPointerMove(140, 180);
    });
    fireEvent.pointerUp(window);

    act(() => {
      useAppStore.getState().setActiveCommentId("note-root");
    });

    expect(await screen.findByText("Check this paragraph")).toBeInTheDocument();
    const card = screen
      .getByText("Check this paragraph")
      .closest(".comment-thread-card");
    expect(card).not.toBeNull();
    if (card) {
      expect(card).not.toHaveStyle({ position: "fixed" });
      expect(card).toHaveStyle({ top: "180px" });
    }
  });
});
