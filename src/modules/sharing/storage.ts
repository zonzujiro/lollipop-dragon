import { encrypt, decrypt } from "../../services/crypto";
import {
  serializePayload,
  deserializePayload,
} from "./sharePayload";
import type { SharePayload } from "../../types/share";
import { normalizeWorkerUrl } from "../../utils/workerUrl";

export interface UploadResult {
  hostSecret: string;
}

export class ShareStorage {
  private readonly workerUrl: string;

  constructor(workerUrl: string) {
    this.workerUrl = normalizeWorkerUrl(workerUrl);
  }

  async uploadContent(
    docId: string,
    tree: Record<string, string>,
    key: CryptoKey,
    opts: { ttl: number; label: string },
  ): Promise<UploadResult> {
    const compressed = await serializePayload(tree);
    const blob = await encrypt(compressed, key);
    const hostSecret = generateSecret();
    const params = new URLSearchParams({
      ttl: String(opts.ttl),
      label: opts.label,
    });
    const response = await fetch(`${this.workerUrl}/share/${docId}?${params}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Host-Secret": hostSecret,
      },
      body: blob,
    });
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }
    return { hostSecret };
  }

  async fetchContent(docId: string, key: CryptoKey): Promise<SharePayload> {
    const response = await fetch(`${this.workerUrl}/share/${docId}`);
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "Share not found or expired"
          : `Fetch failed: ${response.status}`,
      );
    }
    const blob = await response.arrayBuffer();
    const decrypted = await decrypt(blob, key);
    return deserializePayload(decrypted);
  }

  async fetchLastModified(docId: string): Promise<string | null> {
    const response = await fetch(`${this.workerUrl}/share/${docId}`, {
      method: "HEAD",
    });
    if (!response.ok) {
      throw new Error(
        response.status === 404
          ? "Share not found or expired"
          : `Fetch failed: ${response.status}`,
      );
    }
    return response.headers.get("Last-Modified");
  }

  async updateContent(
    docId: string,
    hostSecret: string,
    tree: Record<string, string>,
    key: CryptoKey,
  ): Promise<void> {
    const compressed = await serializePayload(tree);
    const blob = await encrypt(compressed, key);
    const response = await fetch(`${this.workerUrl}/share/${docId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Host-Secret": hostSecret,
      },
      body: blob,
    });
    if (!response.ok) {
      throw new Error(`Update failed: ${response.status}`);
    }
  }

  async deleteContent(docId: string, hostSecret: string): Promise<void> {
    const response = await fetch(`${this.workerUrl}/share/${docId}`, {
      method: "DELETE",
      headers: { "X-Host-Secret": hostSecret },
    });
    if (!response.ok) {
      throw new Error(`Delete failed: ${response.status}`);
    }
  }
}

function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
