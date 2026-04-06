import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShareStorage } from "../services/shareStorage";
import { generateKey } from "../services/crypto";

describe("ShareStorage.updateContent errors", () => {
  const storage = new ShareStorage("https://test.workers.dev");

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when updateContent receives a non-ok response", async () => {
    const key = await generateKey();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Forbidden", { status: 403 }),
    );

    await expect(
      storage.updateContent(
        "doc-123",
        "secret-abc",
        { "doc.md": "# Hello" },
        key,
      ),
    ).rejects.toThrow("Update failed: 403");
  });
});
