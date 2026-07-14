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
import { getActiveTab } from "../../../store/selectors";
import {
  makeComment,
  makePeerComment,
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
    const addButton = screen.getByRole("button", { name: "Add comment" });
    expect(addButton).toBeInTheDocument();
    expect(addButton).toHaveTextContent("+");
    expect(addButton.querySelector("svg")).toBeNull();
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
    expect(
      screen.getByPlaceholderText("ambiguous — make it precise…"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Add comment", { selector: "span" }),
    ).not.toBeInTheDocument();
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
    await user.type(
      screen.getByPlaceholderText("ambiguous — make it precise…"),
      "hello",
    );
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("offers only clarify and rewrite and submits the selected type", async () => {
    const onAddComment = vi.fn();
    const { user } = await openForm(onAddComment);
    expect(
      screen.getByRole("button", { name: /^clarify/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^rewrite/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "fix" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "expand" }),
    ).not.toBeInTheDocument();
    await user.type(
      screen.getByPlaceholderText("ambiguous — make it precise…"),
      "rewrite this please",
    );
    await user.click(screen.getByRole("button", { name: /^rewrite/ }));
    expect(
      screen.getByPlaceholderText("right idea, wrong words…"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onAddComment).toHaveBeenCalledWith(
      2,
      "rewrite",
      "rewrite this please",
    );
  });

  it('defaults to "clarify" type', async () => {
    const onAddComment = vi.fn();
    const { user } = await openForm(onAddComment);
    await user.type(
      screen.getByPlaceholderText("ambiguous — make it precise…"),
      "clarify this",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onAddComment).toHaveBeenCalledWith(2, "clarify", "clarify this");
  });

  it("hides the form when Escape is pressed", async () => {
    const { user } = await openForm();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByPlaceholderText("ambiguous — make it precise…"),
    ).not.toBeInTheDocument();
  });

  it("hides the form after successful submit", async () => {
    const { user } = await openForm();
    await user.type(
      screen.getByPlaceholderText("ambiguous — make it precise…"),
      "done",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      screen.queryByPlaceholderText("ambiguous — make it precise…"),
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
    await user.type(screen.getByLabelText("Comment text"), "draft");

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
        .getByLabelText("Comment text")
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
      .getByLabelText("Comment text")
      .closest(".comment-add-form");
    expect(form).not.toBeNull();
    if (form) {
      expect(form).toHaveStyle({
        position: "fixed",
        left: "120px",
        top: "160px",
      });
    }

    await user.type(screen.getByLabelText("Comment text"), "still ok");
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("clears the active comment when the add form opens", async () => {
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

    expect(getActiveTab(useAppStore.getState())?.activeCommentId).toBe(
      "fix-root",
    );
    await user.click(screen.getByRole("button", { name: "Add comment" }));

    expect(screen.getByLabelText("Comment text")).toBeInTheDocument();
    expect(getActiveTab(useAppStore.getState())?.activeCommentId).toBeNull();
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

  it("closes the add form and selects an existing comment", async () => {
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
    expect(screen.getByLabelText("Comment text")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /fix:/i }));

    expect(screen.queryByLabelText("Comment text")).not.toBeInTheDocument();
    expect(getActiveTab(useAppStore.getState())?.activeCommentId).toBe(
      "fix-root",
    );
  });
});

describe("CommentMargin — existing comment markers", () => {
  it("uses the redesign marker and does not render a floating thread card", async () => {
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

    const marker = await screen.findByRole("button", {
      name: "fix: Fix this paragraph",
    });
    expect(marker).toHaveAttribute("data-comment-type", "fix");
    expect(marker).toHaveClass("comment-margin__dot--active");
    expect(marker.querySelector(".comment-margin__dot-mark")).not.toBeNull();
    expect(document.querySelector(".comment-thread-card")).toBeNull();
  });

  it("opens the comment rail and selects the matching comment", async () => {
    const user = userEvent.setup();
    setTestState({
      activeCommentId: null,
      commentPanelOpen: false,
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

    await user.click(
      await screen.findByRole("button", {
        name: "fix: Fix this paragraph",
      }),
    );

    const activeTab = getActiveTab(useAppStore.getState());
    expect(activeTab?.activeCommentId).toBe("fix-root");
    expect(activeTab?.commentPanelOpen).toBe(true);
    expect(document.querySelector(".comment-thread-card")).toBeNull();
  });

  it("uses the same marker selection behavior in peer mode", async () => {
    const user = userEvent.setup();
    setTestState(
      {},
      {
        isPeerMode: true,
        peerActiveFilePath: "readme.md",
        peerCommentPanelOpen: false,
        myPeerComments: [
          makePeerComment({
            id: "peer-fix",
            commentType: "fix",
            text: "Fix this peer paragraph",
          }),
        ],
      },
    );

    render(
      <CommentMargin
        containerRef={createContainerRef([96])}
        hoveredBlock={null}
        onAddComment={vi.fn()}
        onPostPeerComment={vi.fn()}
        peerMode
      />,
    );

    const marker = await screen.findByRole("button", {
      name: "fix: Fix this peer paragraph",
    });
    expect(marker).toHaveAttribute("data-comment-type", "fix");
    await user.click(marker);

    expect(useAppStore.getState().peerActiveCommentId).toBe("peer-fix");
    expect(useAppStore.getState().peerCommentPanelOpen).toBe(true);
  });
});
