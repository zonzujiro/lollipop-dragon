import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

// ── Module-level mocks (hoisted before imports) ──────────────────────

const {
  mockPostComment,
  mockDeleteComments,
  mockDeleteComment,
  mockUpdateShare,
} = vi.hoisted(() => ({
  mockPostComment: vi.fn().mockResolvedValue("server-cmt-id"),
  mockDeleteComments: vi.fn().mockResolvedValue(undefined),
  mockDeleteComment: vi.fn().mockResolvedValue(undefined),
  mockUpdateShare: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/shareStorage", () => ({
  ShareStorage: vi.fn().mockImplementation(() => ({
    postComment: mockPostComment,
    deleteComments: mockDeleteComments,
    deleteComment: mockDeleteComment,
    fetchComments: vi.fn().mockResolvedValue([]),
    uploadContent: vi.fn(),
    fetchContent: vi.fn(),
    updateContent: vi.fn(),
    deleteContent: vi.fn(),
  })),
}));

vi.mock("../services/shareSync", () => ({
  syncActiveShares: vi.fn(),
  updateShare: mockUpdateShare,
}));

vi.mock("../services/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/crypto")>();
  return {
    ...actual,
    base64urlToKey: vi.fn().mockResolvedValue({} as CryptoKey),
    docIdFromKey: vi.fn().mockResolvedValue("mock-doc-id"),
  };
});

vi.mock("../config", () => ({
  WORKER_URL: "https://mock-worker.test",
}));

// ── Imports (after mocks) ────────────────────────────────────────────

import { CommentPanel } from "../components/CommentPanel";
import { Header } from "../components/Header";
import { useAppStore } from "../store";
import { getActiveTab } from "../store/selectors";
import { setRelayForTesting } from "../services/relay";
import {
  setTestState,
  resetTestStore,
  makePeerComment,
  makeShare,
} from "./testHelpers";

beforeEach(() => {
  resetTestStore();
  setRelayForTesting(null);
  mockPostComment.mockClear();
  mockDeleteComments.mockClear();
  mockDeleteComment.mockClear();
  mockUpdateShare.mockClear();
});

// ── Bug 1: CommentPanel peer mode uses peerActiveFilePath ────────────

describe("CommentPanel — peer mode filters by peerActiveFilePath", () => {
  it("shows peer comments matching peerActiveFilePath", () => {
    const c1 = makePeerComment({
      text: "comment on readme",
      path: "readme.md",
    });
    const c2 = makePeerComment({ text: "comment on other", path: "other.md" });
    setTestState(
      { commentPanelOpen: true },
      {
        isPeerMode: true,
        peerActiveFilePath: "readme.md",
        peerCommentPanelOpen: true,
        myPeerComments: [c1, c2],
      },
    );
    render(<CommentPanel peerMode />);
    expect(screen.getByText("comment on readme")).toBeInTheDocument();
    expect(screen.queryByText("comment on other")).not.toBeInTheDocument();
  });

  it("shows empty state when no comments match peerActiveFilePath", () => {
    const c = makePeerComment({ text: "wrong file", path: "other.md" });
    setTestState(
      { commentPanelOpen: true },
      {
        isPeerMode: true,
        peerActiveFilePath: "readme.md",
        peerCommentPanelOpen: true,
        myPeerComments: [c],
      },
    );
    render(<CommentPanel peerMode />);
    expect(screen.getByText(/No comments yet/)).toBeInTheDocument();
  });

  it("updates when switching peer files", () => {
    const c1 = makePeerComment({ text: "readme note", path: "readme.md" });
    const c2 = makePeerComment({ text: "other note", path: "other.md" });
    setTestState(
      { commentPanelOpen: true },
      {
        isPeerMode: true,
        peerActiveFilePath: "readme.md",
        peerCommentPanelOpen: true,
        myPeerComments: [c1, c2],
      },
    );
    const { rerender } = render(<CommentPanel peerMode />);
    expect(screen.getByText("readme note")).toBeInTheDocument();
    expect(screen.queryByText("other note")).not.toBeInTheDocument();

    // Switch peer file
    useAppStore.setState({ peerActiveFilePath: "other.md" });
    rerender(<CommentPanel peerMode />);
    expect(screen.getByText("other note")).toBeInTheDocument();
    expect(screen.queryByText("readme note")).not.toBeInTheDocument();
  });
});

// ── Peer multi-file: cross-file comment panel ────────────────────────

describe("CommentPanel — peer multi-file shows all comments grouped", () => {
  function setupMultiFile(comments: ReturnType<typeof makePeerComment>[]) {
    setTestState(
      { commentPanelOpen: true },
      {
        isPeerMode: true,
        peerActiveFilePath: "readme.md",
        peerCommentPanelOpen: true,
        myPeerComments: comments,
        sharedContent: {
          version: "2.0" as const,
          created_at: new Date().toISOString(),
          tree: { "readme.md": "# Hello", "other.md": "# Other" },
        },
      },
    );
  }

  it("shows comments from all files when share has multiple files", () => {
    const c1 = makePeerComment({ text: "readme comment", path: "readme.md" });
    const c2 = makePeerComment({ text: "other comment", path: "other.md" });
    setupMultiFile([c1, c2]);
    render(<CommentPanel peerMode />);
    expect(screen.getByText("readme comment")).toBeInTheDocument();
    expect(screen.getByText("other comment")).toBeInTheDocument();
  });

  it("shows file headers for each group", () => {
    const c1 = makePeerComment({ text: "note A", path: "readme.md" });
    const c2 = makePeerComment({ text: "note B", path: "other.md" });
    setupMultiFile([c1, c2]);
    render(<CommentPanel peerMode />);
    expect(screen.getByText("readme.md")).toBeInTheDocument();
    expect(screen.getByText("other.md")).toBeInTheDocument();
  });

  it("shows total count across all files", () => {
    const c1 = makePeerComment({ text: "a", path: "readme.md" });
    const c2 = makePeerComment({ text: "b", path: "other.md" });
    const c3 = makePeerComment({ text: "c", path: "other.md" });
    setupMultiFile([c1, c2, c3]);
    const { container } = render(<CommentPanel peerMode />);
    expect(container.querySelector(".comment-panel__count")?.textContent).toBe(
      "3",
    );
  });

  it("shows empty state when no peer comments exist", () => {
    setupMultiFile([]);
    render(<CommentPanel peerMode />);
    expect(screen.getByText(/No comments across files/)).toBeInTheDocument();
  });
});

// ── Bug 2: syncPeerComments only sends unsubmitted ───────────────────

describe("store.syncPeerComments — no double submit", () => {
  beforeEach(() => {
    window.location.hash = "#s=test-key-b64&n=test";
  });

  afterEach(() => {
    window.location.hash = "";
  });

  it("sends only unsubmitted comments for the current file", async () => {
    const submitted = makePeerComment({ id: "old-1", text: "already sent" });
    const fresh = makePeerComment({ id: "new-1", text: "new comment" });
    const otherFile = makePeerComment({
      id: "other-1",
      text: "other file",
      path: "other.md",
    });
    setTestState(
      {},
      {
        peerActiveFilePath: "readme.md",
        myPeerComments: [submitted, fresh, otherFile],
        submittedPeerCommentIds: ["old-1"],
      },
    );

    await useAppStore.getState().syncPeerComments();

    // Only the unsubmitted comment on readme.md should be sent
    expect(mockPostComment).toHaveBeenCalledTimes(1);
    expect(mockPostComment.mock.calls[0][1].id).toBe("new-1");
  });

  it("marks submitted comment IDs after sync", async () => {
    const c1 = makePeerComment({ id: "c-1" });
    const c2 = makePeerComment({ id: "c-2" });
    setTestState(
      {},
      {
        peerActiveFilePath: "readme.md",
        myPeerComments: [c1, c2],
        submittedPeerCommentIds: [],
      },
    );

    await useAppStore.getState().syncPeerComments();

    const { submittedPeerCommentIds } = useAppStore.getState();
    expect(submittedPeerCommentIds).toContain("c-1");
    expect(submittedPeerCommentIds).toContain("c-2");
  });

  it("does nothing when all comments are already submitted", async () => {
    const c = makePeerComment({ id: "c-1" });
    setTestState(
      {},
      {
        peerActiveFilePath: "readme.md",
        myPeerComments: [c],
        submittedPeerCommentIds: ["c-1"],
      },
    );

    await useAppStore.getState().syncPeerComments();
    expect(mockPostComment).not.toHaveBeenCalled();
  });

  it("preserves previously submitted IDs when syncing new ones", async () => {
    setTestState(
      {},
      {
        peerActiveFilePath: "readme.md",
        myPeerComments: [
          makePeerComment({ id: "c-old" }),
          makePeerComment({ id: "c-new" }),
        ],
        submittedPeerCommentIds: ["c-old"],
      },
    );

    await useAppStore.getState().syncPeerComments();

    const { submittedPeerCommentIds } = useAppStore.getState();
    expect(submittedPeerCommentIds).toContain("c-old");
    expect(submittedPeerCommentIds).toContain("c-new");
  });

  it("does not send comments from other files", async () => {
    const otherFile = makePeerComment({ id: "other-1", path: "other.md" });
    setTestState(
      {},
      {
        peerActiveFilePath: "readme.md",
        myPeerComments: [otherFile],
        submittedPeerCommentIds: [],
      },
    );

    await useAppStore.getState().syncPeerComments();
    expect(mockPostComment).not.toHaveBeenCalled();
  });
});

// ── Bug 2 (store): deletePeerComment cleans submittedPeerCommentIds ──

describe("store.deletePeerComment — cleans up submittedPeerCommentIds", () => {
  it("removes from both myPeerComments and submittedPeerCommentIds", () => {
    const c = makePeerComment({ id: "c-1" });
    setTestState(
      {},
      {
        myPeerComments: [c],
        submittedPeerCommentIds: ["c-1"],
      },
    );

    useAppStore.getState().deletePeerComment("c-1");

    const state = useAppStore.getState();
    expect(state.myPeerComments).toHaveLength(0);
    expect(state.submittedPeerCommentIds).not.toContain("c-1");
  });

  it("leaves other submitted IDs intact", () => {
    const c1 = makePeerComment({ id: "c-1" });
    const c2 = makePeerComment({ id: "c-2" });
    setTestState(
      {},
      {
        myPeerComments: [c1, c2],
        submittedPeerCommentIds: ["c-1", "c-2"],
      },
    );

    useAppStore.getState().deletePeerComment("c-1");

    const state = useAppStore.getState();
    expect(state.myPeerComments).toHaveLength(1);
    expect(state.submittedPeerCommentIds).toEqual(["c-2"]);
  });
});

// ── Bug 3: Header shows only unsubmitted count ──────────────────────

describe("Header — peer mode submit button", () => {
  it("shows unsubmitted count, not total count", () => {
    const c1 = makePeerComment({ id: "c-1", path: "readme.md" });
    const c2 = makePeerComment({ id: "c-2", path: "readme.md" });
    const c3 = makePeerComment({ id: "c-3", path: "readme.md" });
    setTestState(
      {},
      {
        isPeerMode: true,
        peerActiveFilePath: "readme.md",
        peerFileName: "readme.md",
        myPeerComments: [c1, c2, c3],
        submittedPeerCommentIds: ["c-1", "c-2"],
      },
    );

    render(<Header peerMode />);
    const btn = screen.getByRole("button", { name: "Submit comments" });
    expect(btn).toHaveTextContent("Submit comments (1)");
  });

  it("hides submit button when all comments are submitted", () => {
    const c = makePeerComment({ id: "c-1", path: "readme.md" });
    setTestState(
      {},
      {
        isPeerMode: true,
        peerActiveFilePath: "readme.md",
        peerFileName: "readme.md",
        myPeerComments: [c],
        submittedPeerCommentIds: ["c-1"],
      },
    );

    render(<Header peerMode />);
    expect(
      screen.queryByRole("button", { name: "Submit comments" }),
    ).not.toBeInTheDocument();
  });

  it("shows submit button when there are unsubmitted comments", () => {
    const c = makePeerComment({ id: "c-1", path: "readme.md" });
    setTestState(
      {},
      {
        isPeerMode: true,
        peerActiveFilePath: "readme.md",
        peerFileName: "readme.md",
        myPeerComments: [c],
        submittedPeerCommentIds: [],
      },
    );

    render(<Header peerMode />);
    expect(
      screen.getByRole("button", { name: "Submit comments" }),
    ).toBeInTheDocument();
  });

  it("hides submit button when current file has no unsubmitted comments", () => {
    // Comments exist on other.md but we're viewing readme.md
    const c = makePeerComment({ id: "c-1", path: "other.md" });
    setTestState(
      {},
      {
        isPeerMode: true,
        peerActiveFilePath: "readme.md",
        peerFileName: "readme.md",
        myPeerComments: [c],
        submittedPeerCommentIds: [],
      },
    );

    render(<Header peerMode />);
    expect(
      screen.queryByRole("button", { name: "Submit comments" }),
    ).not.toBeInTheDocument();
  });
});

// ── Bug 4: dismissComment deletes individual comment from server ──

describe("store.dismissComment — per-comment server delete", () => {
  it("calls deleteComment on server when a comment is dismissed", () => {
    const comment = makePeerComment({ id: "cmt-1" });
    setTestState({
      pendingComments: { "doc-1": [comment] },
      shares: [makeShare({ hostSecret: "host-sec" })],
    });

    useAppStore.getState().dismissComment("doc-1", "cmt-1");

    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.pendingComments["doc-1"]).toBeUndefined();
    expect(mockDeleteComment).toHaveBeenCalledWith(
      "doc-1",
      "cmt-1",
      "host-sec",
    );
  });

  it("calls deleteComment even when other comments remain", () => {
    const c1 = makePeerComment({ id: "cmt-1" });
    const c2 = makePeerComment({ id: "cmt-2" });
    setTestState({
      pendingComments: { "doc-1": [c1, c2] },
      shares: [makeShare({ hostSecret: "host-sec" })],
    });

    useAppStore.getState().dismissComment("doc-1", "cmt-1");

    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.pendingComments["doc-1"]).toHaveLength(1);
    expect(mockDeleteComment).toHaveBeenCalledWith(
      "doc-1",
      "cmt-1",
      "host-sec",
    );
  });
});

function makeWritableStream() {
  return Object.assign(new WritableStream(), {
    write: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn().mockResolvedValue(undefined),
    truncate: vi.fn().mockResolvedValue(undefined),
  });
}

function makeFileHandle(name = "readme.md"): FileSystemFileHandle {
  return {
    kind: "file",
    name,
    createWritable: vi.fn().mockResolvedValue(makeWritableStream()),
    getFile: vi
      .fn()
      .mockResolvedValue(
        new File(["# Hello\n"], name, { type: "text/markdown" }),
      ),
    isSameEntry: vi.fn().mockResolvedValue(false),
    queryPermission: vi.fn().mockResolvedValue("granted"),
    requestPermission: vi.fn().mockResolvedValue("granted"),
  };
}

describe("store.mergeComment — durable resolve sequence", () => {
  it("deletes from KV, pushes content, then broadcasts resolve", async () => {
    const order: string[] = [];
    mockDeleteComment.mockImplementation(async () => {
      order.push("delete");
    });
    mockUpdateShare.mockImplementation(async () => {
      order.push("update");
    });
    const relaySocket = {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      send: vi.fn().mockImplementation(async () => {
        order.push("send");
      }),
      close: vi.fn(),
    };
    setRelayForTesting(relaySocket);
    const comment = makePeerComment({ id: "cmt-merge-1" });
    setTestState({
      fileHandle: makeFileHandle(),
      fileName: "readme.md",
      activeFilePath: "readme.md",
      rawContent: "# Hello\n",
      comments: [],
      pendingComments: { "doc-1": [comment] },
      shares: [makeShare({ hostSecret: "host-sec" })],
    });

    await useAppStore.getState().mergeComment("doc-1", comment);

    expect(order).toEqual(["delete", "update", "send"]);
    expect(mockDeleteComment).toHaveBeenCalledWith(
      "doc-1",
      "cmt-merge-1",
      "host-sec",
    );
    expect(mockUpdateShare).toHaveBeenCalledWith("doc-1");
    expect(relaySocket.send).toHaveBeenCalledWith("doc-1", {
      type: "comment:resolved",
      commentId: "cmt-merge-1",
    });
    expect(
      useAppStore
        .getState()
        .resolvedCommentIds.get("doc-1")
        ?.has("cmt-merge-1"),
    ).toBe(true);
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.pendingComments["doc-1"]).toBeUndefined();
  });
});

describe("store.clearPendingComments — deletes visible comments individually", () => {
  it("calls deleteComment for each visible pending comment instead of bulk delete", async () => {
    const c1 = makePeerComment({ id: "clear-1" });
    const c2 = makePeerComment({ id: "clear-2" });
    setTestState({
      pendingComments: { "doc-1": [c1, c2] },
      shares: [makeShare({ hostSecret: "host-sec", pendingCommentCount: 2 })],
    });

    await useAppStore.getState().clearPendingComments("doc-1");

    expect(mockDeleteComment).toHaveBeenCalledTimes(2);
    expect(mockDeleteComment).toHaveBeenNthCalledWith(
      1,
      "doc-1",
      "clear-1",
      "host-sec",
    );
    expect(mockDeleteComment).toHaveBeenNthCalledWith(
      2,
      "doc-1",
      "clear-2",
      "host-sec",
    );
    expect(mockDeleteComments).not.toHaveBeenCalled();
    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.pendingComments["doc-1"]).toBeUndefined();
  });
});
