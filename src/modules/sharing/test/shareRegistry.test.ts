import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultTab } from "../../../types/tab";
import { makeShare } from "../../../testing/testHelpers";
import {
  getUnboundLegacyShareKeys,
  loadAndCleanShares,
  saveShares,
} from "../registry";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("workspace-owned share registry", () => {
  it("keeps same-name workspaces separate", () => {
    const firstTab = createDefaultTab({
      id: "tab-a",
      workspaceId: "workspace-a",
      label: "project",
      directoryName: "project",
    });
    const secondTab = createDefaultTab({
      id: "tab-b",
      workspaceId: "workspace-b",
      label: "project",
      directoryName: "project",
    });

    expect(
      saveShares(firstTab.workspaceId, [makeShare({ docId: "doc-a" })]),
    ).toBe(true);
    expect(
      saveShares(secondTab.workspaceId, [makeShare({ docId: "doc-b" })]),
    ).toBe(true);

    const restored = loadAndCleanShares([firstTab, secondTab]);

    expect(restored[firstTab.workspaceId]?.map((share) => share.docId)).toEqual(
      ["doc-a"],
    );
    expect(
      restored[secondTab.workspaceId]?.map((share) => share.docId),
    ).toEqual(["doc-b"]);
  });

  it("leaves ambiguous legacy name bindings unbound instead of choosing a tab", () => {
    const firstTab = createDefaultTab({
      id: "tab-a",
      workspaceId: "workspace-a",
      label: "project",
      directoryName: "project",
    });
    const secondTab = createDefaultTab({
      id: "tab-b",
      workspaceId: "workspace-b",
      label: "project",
      directoryName: "project",
    });
    localStorage.setItem(
      "markreview-shares",
      JSON.stringify({ project: [makeShare({ docId: "legacy-doc" })] }),
    );

    const restored = loadAndCleanShares([firstTab, secondTab]);

    expect(restored).toEqual({});
    expect(getUnboundLegacyShareKeys([firstTab, secondTab])).toEqual([
      "project",
    ]);
    expect(localStorage.getItem("markreview-shares")).not.toBeNull();
  });

  it("reports persistence failure without throwing", () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });

    expect(saveShares("workspace-a", [makeShare()])).toBe(false);
    expect(warning).toHaveBeenCalledWith(
      "[sharing] failed to persist v2 share registry:",
      expect.any(DOMException),
    );
  });

  it("refuses to overwrite the registry when the existing value cannot be read", () => {
    const warning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const originalGetItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (
      key: string,
    ) {
      if (key === "markreview-shares-v2") {
        throw new DOMException("storage unavailable", "SecurityError");
      }
      return originalGetItem.call(this, key);
    });

    expect(saveShares("workspace-a", [makeShare()])).toBe(false);
    expect(warning).toHaveBeenCalledWith(
      "[sharing] failed to load v2 share registry:",
      expect.any(DOMException),
    );
  });
});
