import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchContent = vi.fn();

vi.mock("../../../modules/sharing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../modules/sharing")>();
  return {
    ...actual,
    ShareStorage: vi.fn().mockImplementation(() => ({
      fetchContent: mockFetchContent,
    })),
  };
});

vi.mock("../../../services/crypto", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../../services/crypto")
  >();
  return {
    ...actual,
    base64urlToKey: vi
      .fn()
      .mockImplementation(async () => actual.generateKey()),
    docIdFromKey: vi.fn().mockResolvedValue("mock-doc-id"),
  };
});

vi.mock("../../../config", () => ({
  WORKER_URL: "https://mock-worker.test",
}));

vi.mock("../../../modules/relay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../modules/relay")>();
  return {
    ...actual,
    getRelay: () => ({
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      send: vi.fn(),
      close: vi.fn(),
      hasActiveSubscriptions: () => false,
      isSubscribed: () => false,
    }),
    ensureRelaySubscriptions: vi.fn(),
    startRelayForDoc: vi.fn(),
    unsubscribeFromDoc: vi.fn(),
    relayCommentAdd: vi.fn(),
    relayCommentResolve: vi.fn(),
    isDocSubscribed: () => false,
  };
});

import { useAppStore } from "../../../store";
import { resetTestStore, setTestState } from "../../../testing/testHelpers";

describe("peer-review.loadSharedContent", () => {
  beforeEach(() => {
    resetTestStore();
    mockFetchContent.mockClear();
    window.location.hash = "#s=test-key-b64&n=test";
  });

  afterEach(() => {
    window.location.hash = "";
  });

  it("keeps the current file when it still exists in updated payload", async () => {
    setTestState(
      {},
      {
        isPeerMode: true,
        peerActiveFilePath: "notes.md",
        peerFileName: "notes.md",
        peerRawContent: "old notes",
      },
    );

    mockFetchContent.mockResolvedValue({
      version: "2.0",
      created_at: new Date().toISOString(),
      tree: {
        "readme.md": "# Updated Readme",
        "notes.md": "# Updated Notes",
      },
    });

    await useAppStore.getState().loadSharedContent();

    const state = useAppStore.getState();
    expect(state.peerActiveFilePath).toBe("notes.md");
    expect(state.peerFileName).toBe("notes.md");
    expect(state.peerRawContent).toBe("# Updated Notes");
  });

  it("falls back to first file when current file was removed from payload", async () => {
    setTestState(
      {},
      {
        isPeerMode: true,
        peerActiveFilePath: "deleted.md",
        peerFileName: "deleted.md",
        peerRawContent: "old content",
      },
    );

    mockFetchContent.mockResolvedValue({
      version: "2.0",
      created_at: new Date().toISOString(),
      tree: {
        "readme.md": "# Readme",
        "notes.md": "# Notes",
      },
    });

    await useAppStore.getState().loadSharedContent();

    const state = useAppStore.getState();
    expect(state.peerActiveFilePath).toBe("readme.md");
    expect(state.peerRawContent).toBe("# Readme");
  });

  it("falls back to first file when no file was previously active", async () => {
    setTestState(
      {},
      {
        isPeerMode: true,
        peerActiveFilePath: null,
        peerFileName: null,
        peerRawContent: "",
      },
    );

    mockFetchContent.mockResolvedValue({
      version: "2.0",
      created_at: new Date().toISOString(),
      tree: {
        "readme.md": "# Hello",
      },
    });

    await useAppStore.getState().loadSharedContent();

    const state = useAppStore.getState();
    expect(state.peerActiveFilePath).toBe("readme.md");
    expect(state.peerRawContent).toBe("# Hello");
  });
});
