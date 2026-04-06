import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRelayCommentAdd, mockRelaySend } = vi.hoisted(() => ({
  mockRelaySend: vi.fn().mockResolvedValue(undefined),
  mockRelayCommentAdd: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../services/shareSync", () => ({
  syncActiveShares: vi.fn(),
  updateShare: vi.fn(),
}));

vi.mock("../../../config", () => ({
  WORKER_URL: "https://mock-worker.test",
}));

vi.mock("../../../services/crypto", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../../services/crypto")
  >();
  return {
    ...actual,
    base64urlToKey: vi.fn().mockImplementation(async () => actual.generateKey()),
    docIdFromKey: vi.fn().mockResolvedValue("mock-doc-id"),
  };
});

vi.mock("../../../services/relay", () => ({
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

import { useAppStore } from "../../../store";
import { makePeerComment, resetTestStore, setTestState } from "../../../test/testHelpers";

beforeEach(() => {
  resetTestStore();
  mockRelaySend.mockClear();
  mockRelayCommentAdd.mockClear();
  window.location.hash = "#s=test-key-b64&n=test";
});

afterEach(() => {
  window.location.hash = "";
});

describe("peer-review.syncPeerComments", () => {
  it("sends all unsubmitted comments across shared files", async () => {
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

    expect(mockRelayCommentAdd).toHaveBeenCalledTimes(2);
    expect(mockRelayCommentAdd).toHaveBeenCalledWith(
      "mock-doc-id",
      "new-1",
      expect.objectContaining({ id: "new-1" }),
      expect.any(Object),
    );
    expect(mockRelayCommentAdd).toHaveBeenCalledWith(
      "mock-doc-id",
      "other-1",
      expect.objectContaining({ id: "other-1" }),
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
