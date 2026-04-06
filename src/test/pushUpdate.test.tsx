import { render, screen } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";

// ── Module-level mocks (hoisted before imports) ──────────────────────

const mockUpdateContent = vi.fn().mockResolvedValue(undefined);

vi.mock("../modules/sharing/storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../modules/sharing/storage")>();
  return {
    ...actual,
    ShareStorage: vi.fn().mockImplementation(() => ({
      uploadContent: vi.fn(),
      updateContent: mockUpdateContent,
      deleteContent: vi.fn(),
    })),
  };
});

vi.mock("../config", () => ({
  WORKER_URL: "https://mock-worker.test",
}));

// ── Imports (after mocks) ────────────────────────────────────────────

import { Header } from "../components/Header";
import { syncActiveShares } from "../modules/sharing";
import { setTestState, resetTestStore, makeShare } from "./testHelpers";

beforeEach(() => {
  resetTestStore();
  mockUpdateContent.mockClear();
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
