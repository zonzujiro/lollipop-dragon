import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchLastModified = vi.fn();

vi.mock("../../../config", () => ({
  WORKER_URL: "https://mock-worker.test",
}));

vi.mock("../../sharing", () => ({
  ShareStorage: vi.fn().mockImplementation(() => ({
    fetchLastModified: mockFetchLastModified,
  })),
}));

import { applyPeerDocumentUpdate, performReconnectCatchUp } from "../controller";
import { useAppStore } from "../../../store";
import { makePeerComment, resetTestStore, setTestState } from "../../../testing/testHelpers";

beforeEach(() => {
  resetTestStore();
  mockFetchLastModified.mockReset();
});

describe("relay controller peer content updates", () => {
  it("auto-refreshes peer content when a newer update arrives and there is no local comment work", async () => {
    const loadSharedContent = vi.fn().mockResolvedValue(undefined);
    setTestState(
      {},
      {
        isPeerMode: true,
        peerLoadedUpdatedAt: "2026-04-22T10:00:00.000Z",
        loadSharedContent,
      },
    );

    await applyPeerDocumentUpdate("2026-04-22T11:00:00.000Z");

    expect(loadSharedContent).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().documentUpdateAvailable).toBe(false);
  });

  it("marks the peer view stale instead of auto-refreshing when unsent comments exist", async () => {
    const loadSharedContent = vi.fn().mockResolvedValue(undefined);
    setTestState(
      {},
      {
        isPeerMode: true,
        peerLoadedUpdatedAt: "2026-04-22T10:00:00.000Z",
        loadSharedContent,
        myPeerComments: [makePeerComment({ id: "local-1" })],
        submittedPeerCommentIds: [],
      },
    );

    await applyPeerDocumentUpdate("2026-04-22T11:00:00.000Z");

    expect(loadSharedContent).not.toHaveBeenCalled();
    expect(useAppStore.getState().documentUpdateAvailable).toBe(true);
  });

  it("checks share freshness on reconnect without reloading when content is unchanged", async () => {
    const loadSharedContent = vi.fn().mockResolvedValue(undefined);
    setTestState(
      {},
      {
        isPeerMode: true,
        peerActiveDocId: "doc-1",
        peerLoadedUpdatedAt: "2026-04-22T11:00:00.000Z",
        loadSharedContent,
      },
    );
    mockFetchLastModified.mockResolvedValue("2026-04-22T11:00:00.000Z");

    await performReconnectCatchUp();

    expect(mockFetchLastModified).toHaveBeenCalledWith("doc-1");
    expect(loadSharedContent).not.toHaveBeenCalled();
    expect(useAppStore.getState().documentUpdateAvailable).toBe(false);
  });
});
