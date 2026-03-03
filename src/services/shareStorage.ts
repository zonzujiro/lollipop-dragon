import { encrypt, decrypt } from './crypto'
import { serializePayload, deserializePayload } from './sharePayload'
import type { SharePayload, PeerComment } from '../types/share'

export interface UploadResult {
  hostSecret: string
}

// All Worker interactions go through this class.
// Pass the Worker base URL from import.meta.env.VITE_WORKER_URL.
export class ShareStorage {
  constructor(private readonly workerUrl: string) {}

  // ── Content ──────────────────────────────────────────────────────────

  async uploadContent(
    docId: string,
    tree: Record<string, string>,
    key: CryptoKey,
    opts: { ttl: number; label: string },
  ): Promise<UploadResult> {
    const compressed = await serializePayload(tree)
    const blob = await encrypt(compressed, key)
    const hostSecret = generateSecret()
    const params = new URLSearchParams({ ttl: String(opts.ttl), label: opts.label })
    const res = await fetch(`${this.workerUrl}/share/${docId}?${params}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Host-Secret': hostSecret },
      body: blob,
    })
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
    return { hostSecret }
  }

  async fetchContent(docId: string, key: CryptoKey): Promise<SharePayload> {
    const res = await fetch(`${this.workerUrl}/share/${docId}`)
    if (!res.ok) throw new Error(res.status === 404 ? 'Share not found or expired' : `Fetch failed: ${res.status}`)
    const blob = await res.arrayBuffer()
    const decrypted = await decrypt(blob, key)
    return deserializePayload(decrypted)
  }

  async updateContent(
    docId: string,
    hostSecret: string,
    tree: Record<string, string>,
    key: CryptoKey,
  ): Promise<void> {
    const compressed = await serializePayload(tree)
    const blob = await encrypt(compressed, key)
    const res = await fetch(`${this.workerUrl}/share/${docId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Host-Secret': hostSecret },
      body: blob,
    })
    if (!res.ok) throw new Error(`Update failed: ${res.status}`)
  }

  async deleteContent(docId: string, hostSecret: string): Promise<void> {
    const res = await fetch(`${this.workerUrl}/share/${docId}`, {
      method: 'DELETE',
      headers: { 'X-Host-Secret': hostSecret },
    })
    if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
  }

  // ── Comments ─────────────────────────────────────────────────────────

  async postComment(docId: string, comment: PeerComment, key: CryptoKey): Promise<string> {
    const json = JSON.stringify(comment)
    const blob = await encrypt(new TextEncoder().encode(json), key)
    const res = await fetch(`${this.workerUrl}/comments/${docId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: blob,
    })
    if (!res.ok) throw new Error(`Post comment failed: ${res.status}`)
    const { cmtId } = await res.json() as { cmtId: string }
    return cmtId
  }

  async fetchComments(docId: string, key: CryptoKey): Promise<PeerComment[]> {
    const res = await fetch(`${this.workerUrl}/comments/${docId}`)
    if (!res.ok) throw new Error(`Fetch comments failed: ${res.status}`)
    const encoded = await res.json() as string[]
    return Promise.all(
      encoded.map(async (b64) => {
        const blob = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer
        const decrypted = await decrypt(blob, key)
        return JSON.parse(new TextDecoder().decode(decrypted)) as PeerComment
      }),
    )
  }

  async deleteComments(docId: string, hostSecret: string): Promise<void> {
    const res = await fetch(`${this.workerUrl}/comments/${docId}`, {
      method: 'DELETE',
      headers: { 'X-Host-Secret': hostSecret },
    })
    if (!res.ok) throw new Error(`Delete comments failed: ${res.status}`)
  }
}

function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}
