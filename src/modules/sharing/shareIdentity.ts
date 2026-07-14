import {
  docIdFromKey,
  generateKey,
  keyToBase64url,
} from "../../services/crypto";
import type { PreparedShareIdentity } from "./types";

export async function prepareShareIdentity(): Promise<PreparedShareIdentity> {
  const key = await generateKey();
  const [docId, keyB64] = await Promise.all([
    docIdFromKey(key),
    keyToBase64url(key),
  ]);
  return { docId, key, keyB64 };
}
