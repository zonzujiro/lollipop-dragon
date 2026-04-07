import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUpdateContent, mockRelaySend } = vi.hoisted(() => ({
  mockUpdateContent: vi.fn().mockResolvedValue(undefined),
  mockRelaySend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../modules/relay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../modules/relay")>();
  return {
    ...actual,
    getRelay: () => ({
      send: mockRelaySend,
    }),
  };
});

vi.mock("../../../config", () => ({
  WORKER_URL: "https://mock-worker.test",
}));

vi.mock("../storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage")>();
  return {
    ...actual,
    ShareStorage: vi.fn().mockImplementation(() => ({
      uploadContent: vi.fn(),
      updateContent: mockUpdateContent,
      deleteContent: vi.fn(),
    })),
  };
});

import { syncActiveShares } from "../sync";
import { useAppStore } from "../../../store";
import {
  makeShare,
  resetTestStore,
  setTestState,
} from "../../../testing/testHelpers";

beforeEach(() => {
  resetTestStore();
  mockUpdateContent.mockClear();
  mockRelaySend.mockClear();
});

describe("syncActiveShares", () => {
  it("does nothing in peer mode", async () => {
    setTestState({ shares: [makeShare()] }, { isPeerMode: true });

    await syncActiveShares(useAppStore.getState());
    expect(mockUpdateContent).not.toHaveBeenCalled();
  });

  it("skips expired shares", async () => {
    const expiredShare = makeShare({
      expiresAt: new Date(Date.now() - 86400000).toISOString(),
    });
    setTestState({
      shares: [expiredShare],
      rawContent: "# Hello",
      fileName: "readme.md",
      activeFilePath: "readme.md",
    });

    await syncActiveShares(useAppStore.getState());
    expect(mockUpdateContent).not.toHaveBeenCalled();
  });
});
