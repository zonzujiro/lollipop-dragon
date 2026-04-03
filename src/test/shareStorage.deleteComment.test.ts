import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShareStorage } from "../services/shareStorage";

describe("ShareStorage.deleteComment", () => {
  const storage = new ShareStorage("https://test.workers.dev");

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends DELETE to /comments/:docId/:cmtId with host secret header", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await storage.deleteComment("doc-123", "cmt-456", "secret-abc");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://test.workers.dev/comments/doc-123/cmt-456",
      {
        method: "DELETE",
        headers: { "X-Host-Secret": "secret-abc" },
      },
    );
  });

  it("throws on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Forbidden", { status: 403 }),
    );

    await expect(
      storage.deleteComment("doc-123", "cmt-456", "bad-secret"),
    ).rejects.toThrow("Delete comment failed: 403");
  });
});
