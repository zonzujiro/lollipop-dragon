import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRelaySend, mockRelayCommentAdd } = vi.hoisted(() => ({
  mockRelaySend: vi.fn().mockResolvedValue(undefined),
  mockRelayCommentAdd: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/shareSync", () => ({
  syncActiveShares: vi.fn(),
  updateShare: vi.fn(),
}));

vi.mock("../config", () => ({
  WORKER_URL: "https://mock-worker.test",
}));

vi.mock("../services/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/crypto")>();
  return {
    ...actual,
    base64urlToKey: vi.fn().mockImplementation(async () => actual.generateKey()),
    docIdFromKey: vi.fn().mockResolvedValue("mock-doc-id"),
  };
});

vi.mock("../services/relay", () => ({
  getRelay: () => ({
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    send: mockRelaySend,
    close: vi.fn(),
    hasActiveSubscriptions: () => false,
    isSubscribed: () => false,
  }),
  ensureRelaySubscriptions: vi.fn(),
  startRelayForDoc: vi.fn(),
  unsubscribeFromDoc: vi.fn(),
  relayCommentAdd: mockRelayCommentAdd,
  relayCommentResolve: vi.fn(),
  isDocSubscribed: () => false,
}));

import { CommentPanel } from "../components/CommentPanel";
import { useAppStore } from "../store";
import type { SharePayload } from "../types/share";
import { makePeerComment, resetTestStore, setTestState } from "./testHelpers";

beforeEach(() => {
  resetTestStore();
  mockRelaySend.mockClear();
  mockRelayCommentAdd.mockClear();
});

afterEach(() => {
  window.location.hash = "";
});

describe("CommentPanel peer mode", () => {
  it("filters comments by peerActiveFilePath", () => {
    const firstComment = makePeerComment({
      text: "comment on readme",
      path: "readme.md",
    });
    const secondComment = makePeerComment({
      text: "comment on other",
      path: "other.md",
    });
    setTestState(
      { commentPanelOpen: true },
      {
        isPeerMode: true,
        peerActiveFilePath: "readme.md",
        peerCommentPanelOpen: true,
        myPeerComments: [firstComment, secondComment],
      },
    );

    render(<CommentPanel peerMode />);

    expect(screen.getByText("comment on readme")).toBeInTheDocument();
    expect(screen.queryByText("comment on other")).not.toBeInTheDocument();
  });

  it("shows all peer comments for multi-file shares", () => {
    const firstComment = makePeerComment({
      text: "readme comment",
      path: "readme.md",
    });
    const secondComment = makePeerComment({
      text: "other comment",
      path: "other.md",
    });
    const sharedContent = {
      version: "2.0",
      created_at: new Date().toISOString(),
      tree: { "readme.md": "# Hello", "other.md": "# Other" },
    } satisfies SharePayload;
    setTestState(
      { commentPanelOpen: true },
      {
        isPeerMode: true,
        peerActiveFilePath: "readme.md",
        peerCommentPanelOpen: true,
        myPeerComments: [firstComment, secondComment],
        sharedContent,
      },
    );

    render(<CommentPanel peerMode />);

    expect(screen.getByText("readme comment")).toBeInTheDocument();
    expect(screen.getByText("other comment")).toBeInTheDocument();
  });
});

describe("store.syncPeerComments", () => {
  beforeEach(() => {
    window.location.hash = "#s=test-key-b64&n=test";
  });

  it("sends only unsubmitted comments for the current file", async () => {
    const submittedComment = makePeerComment({
      id: "old-1",
      text: "already sent",
    });
    const freshComment = makePeerComment({ id: "new-1", text: "new comment" });
    const otherFileComment = makePeerComment({
      id: "other-1",
      text: "other file",
      path: "other.md",
    });
    setTestState(
      {},
      {
        peerActiveFilePath: "readme.md",
        myPeerComments: [submittedComment, freshComment, otherFileComment],
        submittedPeerCommentIds: ["old-1"],
      },
    );

    await useAppStore.getState().syncPeerComments();

    expect(mockRelayCommentAdd).toHaveBeenCalledTimes(1);
    expect(mockRelayCommentAdd).toHaveBeenCalledWith(
      "mock-doc-id",
      "new-1",
      expect.objectContaining({ id: "new-1" }),
      expect.any(Object),
    );
  });

  it("waits for relay ack before marking comments submitted", async () => {
    const firstComment = makePeerComment({ id: "c-1" });
    const secondComment = makePeerComment({ id: "c-2" });
    setTestState(
      {},
      {
        peerActiveFilePath: firstComment.path,
        myPeerComments: [firstComment, secondComment],
        submittedPeerCommentIds: [],
      },
    );

    await useAppStore.getState().syncPeerComments();

    expect(useAppStore.getState().submittedPeerCommentIds).toEqual([]);

    useAppStore.getState().confirmPeerCommentSubmitted("c-1");

    expect(useAppStore.getState().submittedPeerCommentIds).toEqual(["c-1"]);
  });
});
