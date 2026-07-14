import { describe, expect, it } from "vitest";
import { docIdFromKey, keyToBase64url } from "../../services/crypto";
import { prepareShareIdentity } from "./shareIdentity";

describe("prepareShareIdentity", () => {
  it("prepares a self-consistent local identity without uploading content", async () => {
    const identity = await prepareShareIdentity();

    await expect(docIdFromKey(identity.key)).resolves.toBe(identity.docId);
    await expect(keyToBase64url(identity.key)).resolves.toBe(identity.keyB64);
  });
});
