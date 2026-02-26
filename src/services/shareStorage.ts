import { encrypt, decrypt } from './crypto'
import { serializePayload, deserializePayload } from './sharePayload'
import type { SharePayload, PeerComment } from '../types/share'

export interface UploadResult {
  docId: string
  hostSecret: string
}

// All Worker interactions go through this class.
// Pass the Worker base URL from import.meta.env.VITE_WORKER_URL.
export class ShareStorage {
  constructor(private readonly workerUrl: string) {}

  // ── Content ──────────────────────────────────────────────────────────

  async uploadContent(
    tree: Record<string, string>,
    key: CryptoKey,
    opts: { ttl: number; label: string },
  ): Promise<UploadResult> {
    const compressed = await serializePayload(tree)
    console.log('[share] serialized payload:', compressed.byteLength, 'bytes (compressed)')
    const blob = await encrypt(compressed, key)
    console.log('[share] encrypted blob:', blob.byteLength, 'bytes')
    const hostSecret = generateSecret()
    const params = new URLSearchParams({ ttl: String(opts.ttl), label: opts.label })
    const url = `${this.workerUrl}/share?${params}`
    console.log('[share] POST', url, 'body size:', blob.byteLength)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Host-Secret': hostSecret },
      body: blob,
    })
    console.log('[share] POST response:', res.status, res.statusText)
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
    const data = await res.json() as { docId: string }
    console.log('[share] POST result:', data)
    return { docId: data.docId, hostSecret }
  }

  async fetchContent(docId: string, key: CryptoKey): Promise<SharePayload> {
    const url = `${this.workerUrl}/share/${docId}`
    console.log('[share] GET', url)
    const res = await fetch(url)
    console.log('[share] GET response:', res.status, res.statusText)
    if (!res.ok) throw new Error(res.status === 404 ? 'Share not found or expired' : `Fetch failed: ${res.status}`)
    const blob = await res.arrayBuffer()
    console.log('[share] GET blob size:', blob.byteLength, 'bytes')
    const decrypted = await decrypt(blob, key)
    console.log('[share] decrypted size:', decrypted.byteLength, 'bytes')
    const payload = await deserializePayload(decrypted)
    console.log('[share] deserialized payload:', { files: Object.keys(payload.tree).length, version: payload.version })
    return payload
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
