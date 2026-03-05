import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import type { PeerComment, ShareRecord } from "../types/share";

// ── Module-level mocks (hoisted before imports) ──────────────────────

const mockPostComment = vi.fn().mockResolvedValue("server-cmt-id");
const mockDeleteComments = vi.fn().mockResolvedValue(undefined);

vi.mock("../services/shareStorage", () => ({
  ShareStorage: vi.fn().mockImplementation(() => ({
    postComment: mockPostComment,
    deleteComments: mockDeleteComments,
    fetchComments: vi.fn().mockResolvedValue([]),
    uploadContent: vi.fn(),
    fetchContent: vi.fn(),
    updateContent: vi.fn(),
    deleteContent: vi.fn(),
  })),
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
import { setTestState, resetTestStore } from "./testHelpers";

function makePeerComment(overrides: Partial<PeerComment> = {}): PeerComment {
  return {
    id: `c_${crypto.randomUUID()}`,
    peerName: "Alice",
    path: "readme.md",
    blockRef: { blockIndex: 0, contentPreview: "Some text" },
    commentType: "note",
    text: "A comment",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeShare(overrides: Partial<ShareRecord> = {}): ShareRecord {
  return {
    docId: "doc-1",
    hostSecret: "secret",
    label: "my-doc",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    pendingCommentCount: 0,
    keyB64: "test-key",
    fileCount: 1,
    ...overrides,
  };
}

beforeEach(() => {
  resetTestStore();
  mockPostComment.mockClear();
  mockDeleteComments.mockClear();
});

// ── Bug 1: CommentPanel peer mode uses peerActiveFilePath ────────────

describe("CommentPanel — peer mode filters by peerActiveFilePath", () => {
  it("shows peer comments matching peerActiveFilePath", () => {
    const c1 = makePeerComment({ text: "comment on readme", path: "readme.md" });
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

// ── Bug 2: syncPeerComments only sends unsubmitted ───────────────────

describe("store.syncPeerComments — no double submit", () => {
  beforeEach(() => {
    window.location.hash = "#s=test-key-b64&n=test";
  });

  afterEach(() => {
    window.location.hash = "";
  });

  it("sends only unsubmitted comments", async () => {
    const submitted = makePeerComment({ id: "old-1", text: "already sent" });
    const fresh = makePeerComment({ id: "new-1", text: "new comment" });
    setTestState({}, {
      myPeerComments: [submitted, fresh],
      submittedPeerCommentIds: ["old-1"],
    });

    await useAppStore.getState().syncPeerComments();

    expect(mockPostComment).toHaveBeenCalledTimes(1);
    expect(mockPostComment.mock.calls[0][1].id).toBe("new-1");
  });

  it("marks submitted comment IDs after sync", async () => {
    const c1 = makePeerComment({ id: "c-1" });
    const c2 = makePeerComment({ id: "c-2" });
    setTestState({}, {
      myPeerComments: [c1, c2],
      submittedPeerCommentIds: [],
    });

    await useAppStore.getState().syncPeerComments();

    const { submittedPeerCommentIds } = useAppStore.getState();
    expect(submittedPeerCommentIds).toContain("c-1");
    expect(submittedPeerCommentIds).toContain("c-2");
  });

  it("does nothing when all comments are already submitted", async () => {
    const c = makePeerComment({ id: "c-1" });
    setTestState({}, {
      myPeerComments: [c],
      submittedPeerCommentIds: ["c-1"],
    });

    await useAppStore.getState().syncPeerComments();
    expect(mockPostComment).not.toHaveBeenCalled();
  });

  it("preserves previously submitted IDs when syncing new ones", async () => {
    setTestState({}, {
      myPeerComments: [
        makePeerComment({ id: "c-old" }),
        makePeerComment({ id: "c-new" }),
      ],
      submittedPeerCommentIds: ["c-old"],
    });

    await useAppStore.getState().syncPeerComments();

    const { submittedPeerCommentIds } = useAppStore.getState();
    expect(submittedPeerCommentIds).toContain("c-old");
    expect(submittedPeerCommentIds).toContain("c-new");
  });
});

// ── Bug 2 (store): deletePeerComment cleans submittedPeerCommentIds ──

describe("store.deletePeerComment — cleans up submittedPeerCommentIds", () => {
  it("removes from both myPeerComments and submittedPeerCommentIds", () => {
    const c = makePeerComment({ id: "c-1" });
    setTestState({}, {
      myPeerComments: [c],
      submittedPeerCommentIds: ["c-1"],
    });

    useAppStore.getState().deletePeerComment("c-1");

    const state = useAppStore.getState();
    expect(state.myPeerComments).toHaveLength(0);
    expect(state.submittedPeerCommentIds).not.toContain("c-1");
  });

  it("leaves other submitted IDs intact", () => {
    const c1 = makePeerComment({ id: "c-1" });
    const c2 = makePeerComment({ id: "c-2" });
    setTestState({}, {
      myPeerComments: [c1, c2],
      submittedPeerCommentIds: ["c-1", "c-2"],
    });

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
    setTestState({}, {
      isPeerMode: true,
      peerActiveFilePath: "readme.md",
      peerFileName: "readme.md",
      myPeerComments: [c1, c2, c3],
      submittedPeerCommentIds: ["c-1", "c-2"],
    });

    render(<Header peerMode />);
    const btn = screen.getByRole("button", { name: "Submit comments" });
    expect(btn).toHaveTextContent("Submit comments (1)");
  });

  it("hides submit button when all comments are submitted", () => {
    const c = makePeerComment({ id: "c-1", path: "readme.md" });
    setTestState({}, {
      isPeerMode: true,
      peerActiveFilePath: "readme.md",
      peerFileName: "readme.md",
      myPeerComments: [c],
      submittedPeerCommentIds: ["c-1"],
    });

    render(<Header peerMode />);
    expect(
      screen.queryByRole("button", { name: "Submit comments" }),
    ).not.toBeInTheDocument();
  });

  it("shows submit button when there are unsubmitted comments", () => {
    const c = makePeerComment({ id: "c-1", path: "readme.md" });
    setTestState({}, {
      isPeerMode: true,
      peerActiveFilePath: "readme.md",
      peerFileName: "readme.md",
      myPeerComments: [c],
      submittedPeerCommentIds: [],
    });

    render(<Header peerMode />);
    expect(
      screen.getByRole("button", { name: "Submit comments" }),
    ).toBeInTheDocument();
  });
});

// ── Bug 4: dismissComment clears server when last comment dismissed ──

describe("store.dismissComment — server cleanup on last dismiss", () => {
  it("calls deleteComments on server when last comment is dismissed", () => {
    const comment = makePeerComment({ id: "cmt-1" });
    setTestState({
      pendingComments: { "doc-1": [comment] },
      shares: [makeShare({ hostSecret: "host-sec" })],
    });

    useAppStore.getState().dismissComment("doc-1", "cmt-1");

    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.pendingComments["doc-1"]).toHaveLength(0);
    expect(mockDeleteComments).toHaveBeenCalledWith("doc-1", "host-sec");
  });

  it("does not call deleteComments when other comments remain", () => {
    const c1 = makePeerComment({ id: "cmt-1" });
    const c2 = makePeerComment({ id: "cmt-2" });
    setTestState({
      pendingComments: { "doc-1": [c1, c2] },
      shares: [makeShare({ hostSecret: "host-sec" })],
    });

    useAppStore.getState().dismissComment("doc-1", "cmt-1");

    const tab = getActiveTab(useAppStore.getState());
    expect(tab?.pendingComments["doc-1"]).toHaveLength(1);
    expect(mockDeleteComments).not.toHaveBeenCalled();
  });
});
