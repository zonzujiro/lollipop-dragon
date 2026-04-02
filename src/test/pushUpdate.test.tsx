import { render, screen } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";

// ── Module-level mocks (hoisted before imports) ──────────────────────

const mockUpdateContent = vi.fn().mockResolvedValue(undefined);
const mockFetchContent = vi.fn();

vi.mock("../services/shareStorage", () => ({
  ShareStorage: vi.fn().mockImplementation(() => ({
    postComment: vi.fn().mockResolvedValue("server-cmt-id"),
    deleteComments: vi.fn().mockResolvedValue(undefined),
    fetchComments: vi.fn().mockResolvedValue([]),
    uploadContent: vi.fn(),
    fetchContent: mockFetchContent,
    updateContent: mockUpdateContent,
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

import { Header } from "../components/Header";
import { useAppStore } from "../store";
import { syncActiveShares } from "../services/shareSync";
import { setTestState, resetTestStore, makeShare } from "./testHelpers";

beforeEach(() => {
  resetTestStore();
  mockUpdateContent.mockClear();
  mockFetchContent.mockClear();
});

// ── Host: Push update button ─────────────────────────────────────────

describe("Header — Push update button", () => {
  it("shows Push update when there are active shares", () => {
    setTestState({
      shares: [makeShare()],
      fileName: "readme.md",
    });
    render(<Header />);
    expect(
      screen.getByRole("button", { name: /Push update/i }),
    ).toBeInTheDocument();
  });

  it("hides Push update when there are no shares", () => {
    setTestState({
      shares: [],
      fileName: "readme.md",
    });
    render(<Header />);
    expect(
      screen.queryByRole("button", { name: /Push update/i }),
    ).not.toBeInTheDocument();
  });

  it("hides Push update when all shares are expired", () => {
    const expired = makeShare({
      expiresAt: new Date(Date.now() - 86400000).toISOString(),
    });
    setTestState({
      shares: [expired],
      fileName: "readme.md",
    });
    render(<Header />);
    expect(
      screen.queryByRole("button", { name: /Push update/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Push update when at least one share is active among expired ones", () => {
    const expired = makeShare({
      docId: "expired-doc",
      expiresAt: new Date(Date.now() - 86400000).toISOString(),
    });
    const active = makeShare({
      docId: "active-doc",
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    setTestState({
      shares: [expired, active],
      fileName: "readme.md",
    });
    render(<Header />);
    expect(
      screen.getByRole("button", { name: /Push update/i }),
    ).toBeInTheDocument();
  });

  it("does not show Push update in peer mode", () => {
    setTestState(
      { shares: [makeShare()], fileName: "readme.md" },
      { isPeerMode: true, peerFileName: "readme.md" },
    );
    render(<Header peerMode />);
    expect(
      screen.queryByRole("button", { name: /Push update/i }),
    ).not.toBeInTheDocument();
  });
});

// ── Peer: Get latest preserves active file ───────────────────────────

describe("store.loadSharedContent — preserves active file", () => {
  beforeEach(() => {
    window.location.hash = "#s=test-key-b64&n=test";
  });

  afterEach(() => {
    window.location.hash = "";
  });

  it("keeps the current file when it still exists in updated payload", async () => {
    // Set initial peer state viewing "notes.md"
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

// ── syncActiveShares ────────────────────────────────────────────────

describe("syncActiveShares", () => {
  it("does nothing in peer mode", async () => {
    setTestState({ shares: [makeShare()] }, { isPeerMode: true });

    await syncActiveShares();
    expect(mockUpdateContent).not.toHaveBeenCalled();
  });

  it("skips expired shares", async () => {
    const expired = makeShare({
      expiresAt: new Date(Date.now() - 86400000).toISOString(),
    });
    setTestState({
      shares: [expired],
      rawContent: "# Hello",
      fileName: "readme.md",
      activeFilePath: "readme.md",
    });

    await syncActiveShares();
    expect(mockUpdateContent).not.toHaveBeenCalled();
  });
});
