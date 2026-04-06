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
      updateContent: mockUpdateContent,
    })),
  };
});

import { generateKey } from "../../../services/crypto";
import { syncActiveShares, updateShare } from "../sync";
import {
  resetTestStore,
  setTestState,
  makeShare,
} from "../../../test/testHelpers";

beforeEach(() => {
  resetTestStore();
  mockUpdateContent.mockClear();
  mockRelaySend.mockClear();
});

describe("shareSync", () => {
  it("updateShare uploads the active tab content and broadcasts document:updated", async () => {
    const key = await generateKey();
    const share = makeShare({
      docId: "doc-1",
      sharedPaths: ["readme.md"],
    });
    setTestState({
      shares: [share],
      shareKeys: { "doc-1": key },
      fileName: "readme.md",
      activeFilePath: "readme.md",
      rawContent: "# Hello",
    });

    await updateShare("doc-1");

    expect(mockUpdateContent).toHaveBeenCalledWith(
      "doc-1",
      share.hostSecret,
      { "readme.md": "# Hello" },
      key,
    );
    expect(mockRelaySend).toHaveBeenCalledWith(
      "doc-1",
      expect.objectContaining({ type: "document:updated" }),
    );
  });

  it("syncActiveShares skips expired shares", async () => {
    const key = await generateKey();
    const activeShare = makeShare({
      docId: "active-doc",
      sharedPaths: ["readme.md"],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const expiredShare = makeShare({
      docId: "expired-doc",
      sharedPaths: ["readme.md"],
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    setTestState({
      shares: [activeShare, expiredShare],
      shareKeys: {
        "active-doc": key,
        "expired-doc": key,
      },
      fileName: "readme.md",
      activeFilePath: "readme.md",
      rawContent: "# Hello",
    });

    await syncActiveShares();

    expect(mockUpdateContent).toHaveBeenCalledTimes(1);
    expect(mockUpdateContent).toHaveBeenCalledWith(
      "active-doc",
      activeShare.hostSecret,
      { "readme.md": "# Hello" },
      key,
    );
  });
});
