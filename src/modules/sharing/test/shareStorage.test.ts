import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShareStorage } from "../../../services/shareStorage";
import { encrypt, generateKey } from "../../../services/crypto";
import { serializePayload } from "../../../services/sharePayload";
import { normalizeWorkerUrl } from "../../../utils/workerUrl";

const WORKER_URL = "https://worker.test";

interface MockResponseShape {
  ok: boolean;
  status?: number;
  json?: unknown;
  arrayBuffer?: ArrayBuffer;
}

function makeFetchMock(responses: MockResponseShape[]) {
  let responseIndex = 0;
  return vi.fn(async () => {
    const response = responses[responseIndex] ?? { ok: false, status: 500 };
    responseIndex += 1;
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => response.json,
      arrayBuffer: async () => response.arrayBuffer ?? new ArrayBuffer(0),
    };
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ShareStorage.uploadContent", () => {
  it("POSTs to /share and returns a host secret", async () => {
    const key = await generateKey();
    const fetchMock = makeFetchMock([{ ok: true, json: { ok: true } }]);
    vi.stubGlobal("fetch", fetchMock);

    const storage = new ShareStorage(WORKER_URL);
    const result = await storage.uploadContent(
      "abc123",
      { "a.md": "# A" },
      key,
      { ttl: 604800, label: "test" },
    );

    expect(result.hostSecret).toHaveLength(64);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/share/abc123"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("normalizes a trailing slash in the worker URL", async () => {
    const key = await generateKey();
    const fetchMock = makeFetchMock([{ ok: true, json: { ok: true } }]);
    vi.stubGlobal("fetch", fetchMock);

    const storage = new ShareStorage(`${WORKER_URL}/`);
    await storage.uploadContent(
      "abc123",
      { "a.md": "# A" },
      key,
      { ttl: 604800, label: "test" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/worker\.test\/share\/abc123\?/),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("normalizeWorkerUrl", () => {
  it("removes trailing slashes and surrounding whitespace", () => {
    expect(normalizeWorkerUrl(" https://worker.test/// ")).toBe(
      "https://worker.test",
    );
  });
});

describe("ShareStorage.fetchContent", () => {
  it("GETs /share/:docId and decrypts the payload", async () => {
    const key = await generateKey();
    const compressed = await serializePayload({ "b.md": "# B" });
    const encrypted = await encrypt(compressed, key);
    const fetchMock = makeFetchMock([{ ok: true, arrayBuffer: encrypted }]);
    vi.stubGlobal("fetch", fetchMock);

    const storage = new ShareStorage(WORKER_URL);
    const payload = await storage.fetchContent("doc1", key);

    expect(payload.tree).toEqual({ "b.md": "# B" });
  });

  it("throws on 404", async () => {
    const key = await generateKey();
    vi.stubGlobal("fetch", makeFetchMock([{ ok: false, status: 404 }]));

    const storage = new ShareStorage(WORKER_URL);

    await expect(storage.fetchContent("missing", key)).rejects.toThrow(
      "Share not found or expired",
    );
  });
});

describe("ShareStorage.updateContent", () => {
  it("PUTs updated encrypted content with the host secret header", async () => {
    const key = await generateKey();
    const fetchMock = makeFetchMock([{ ok: true }]);
    vi.stubGlobal("fetch", fetchMock);

    const storage = new ShareStorage(WORKER_URL);
    await storage.updateContent("doc1", "secret-123", { "doc.md": "# Hi" }, key);

    expect(fetchMock).toHaveBeenCalledWith(
      `${WORKER_URL}/share/doc1`,
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ "X-Host-Secret": "secret-123" }),
      }),
    );
  });
});

describe("ShareStorage.deleteContent", () => {
  it("sends DELETE with X-Host-Secret header", async () => {
    const fetchMock = makeFetchMock([{ ok: true }]);
    vi.stubGlobal("fetch", fetchMock);

    const storage = new ShareStorage(WORKER_URL);
    await storage.deleteContent("doc1", "mysecret");

    expect(fetchMock).toHaveBeenCalledWith(
      `${WORKER_URL}/share/doc1`,
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ "X-Host-Secret": "mysecret" }),
      }),
    );
  });
});
