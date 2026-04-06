import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockDeleteComment, mockBroadcast } = vi.hoisted(() => ({
  mockDeleteComment: vi.fn(),
  mockBroadcast: vi.fn(),
}));

vi.mock("../services/shareStorage", () => ({
  ShareStorage: vi.fn().mockImplementation(() => ({
    deleteComment: mockDeleteComment,
    deleteComments: vi.fn(),
    postComment: vi.fn(),
    fetchComments: vi.fn().mockResolvedValue([]),
    uploadContent: vi.fn(),
    fetchContent: vi.fn(),
    updateContent: vi.fn(),
    deleteContent: vi.fn(),
  })),
}));

vi.mock("../services/relay", () => ({
  broadcastCommentResolved: mockBroadcast,
  getRelay: () => null,
}));

vi.mock("../config", () => ({
  WORKER_URL: "https://mock-worker.test",
}));

import {
  deleteCommentFromKV,
  deleteCommentsFromKV,
} from "../services/shareSync";
import { useAppStore } from "../store";

beforeEach(() => {
  vi.useFakeTimers();
  mockDeleteComment.mockReset();
  mockBroadcast.mockReset();
  useAppStore.setState({ toast: null });
});

afterEach(() => {
  vi.useRealTimers();
});

async function flushRetries(retryCount: number): Promise<void> {
  for (let index = 0; index < retryCount; index++) {
    await vi.advanceTimersByTimeAsync(15000);
  }
}

describe("deleteCommentFromKV retry", () => {
  it("succeeds on first attempt without retrying", async () => {
    mockDeleteComment.mockResolvedValueOnce(undefined);

    const promise = deleteCommentFromKV("doc-1", "cmt-1", "secret");
    await vi.advanceTimersByTimeAsync(0);
    await promise;

    expect(mockDeleteComment).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().toast).toBeNull();
  });

  it("retries on failure and succeeds on second attempt", async () => {
    mockDeleteComment
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);

    const promise = deleteCommentFromKV("doc-1", "cmt-1", "secret");
    await vi.advanceTimersByTimeAsync(3000);
    await promise;

    expect(mockDeleteComment).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().toast).toBeNull();
  });

  it("shows toast after all retries exhausted", async () => {
    mockDeleteComment.mockRejectedValue(new Error("network"));

    const promise = deleteCommentFromKV("doc-1", "cmt-1", "secret");
    await flushRetries(3);
    await promise;

    expect(mockDeleteComment).toHaveBeenCalledTimes(4);
    expect(useAppStore.getState().toast).toContain("failed");
  });
});

describe("deleteCommentsFromKV retry", () => {
  it("retries each comment independently", async () => {
    mockDeleteComment
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const promise = deleteCommentsFromKV("doc-1", ["cmt-1", "cmt-2"], "secret");
    await flushRetries(3);
    await promise;

    expect(mockDeleteComment).toHaveBeenCalledWith("doc-1", "cmt-2", "secret");
    expect(useAppStore.getState().toast).toBeNull();
  });
});
