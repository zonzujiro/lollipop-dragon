import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ShareStorage } from '../services/shareStorage'
import { generateKey } from '../services/crypto'
import type { PeerComment } from '../types/share'

const WORKER = 'https://worker.test'

function makeFetchMock(responses: Array<{ ok: boolean; status?: number; json?: unknown; arrayBuffer?: ArrayBuffer }>) {
  let idx = 0
  return vi.fn(async () => {
    const r = responses[idx++] ?? { ok: false, status: 500 }
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.json,
      arrayBuffer: async () => r.arrayBuffer ?? new ArrayBuffer(0),
    }
  })
}

describe('ShareStorage.uploadContent', () => {
  it('POSTs to /share and returns docId + hostSecret', async () => {
    const key = await generateKey()
    const fetchMock = makeFetchMock([{ ok: true, json: { docId: 'abc123' } }])
    vi.stubGlobal('fetch', fetchMock)
    const storage = new ShareStorage(WORKER)
    const result = await storage.uploadContent({ 'a.md': '# A' }, key, { ttl: 604800, label: 'test' })
    expect(result.docId).toBe('abc123')
    expect(result.hostSecret).toHaveLength(64)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/share'),
      expect.objectContaining({ method: 'POST' }),
    )
    vi.unstubAllGlobals()
  })
})

describe('ShareStorage.fetchContent', () => {
  it('GETs /share/:docId and decrypts the payload', async () => {
    const key = await generateKey()
    // Pre-encrypt a payload so the mock returns real encrypted data
    const { serializePayload } = await import('../services/sharePayload')
    const { encrypt } = await import('../services/crypto')
    const compressed = await serializePayload({ 'b.md': '# B' })
    const encrypted = await encrypt(compressed, key)
    const fetchMock = makeFetchMock([{ ok: true, arrayBuffer: encrypted }])
    vi.stubGlobal('fetch', fetchMock)
    const storage = new ShareStorage(WORKER)
    const payload = await storage.fetchContent('doc1', key)
    expect(payload.tree).toEqual({ 'b.md': '# B' })
    vi.unstubAllGlobals()
  })

  it('throws on 404', async () => {
    const key = await generateKey()
    vi.stubGlobal('fetch', makeFetchMock([{ ok: false, status: 404 }]))
    const storage = new ShareStorage(WORKER)
    await expect(storage.fetchContent('missing', key)).rejects.toThrow('Share not found or expired')
    vi.unstubAllGlobals()
  })
})

describe('ShareStorage.deleteContent', () => {
  it('sends DELETE with X-Host-Secret header', async () => {
    const fetchMock = makeFetchMock([{ ok: true, json: { ok: true } }])
    vi.stubGlobal('fetch', fetchMock)
    const storage = new ShareStorage(WORKER)
    await storage.deleteContent('doc1', 'mysecret')
    expect(fetchMock).toHaveBeenCalledWith(
      `${WORKER}/share/doc1`,
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ 'X-Host-Secret': 'mysecret' }),
      }),
    )
    vi.unstubAllGlobals()
  })
})

describe('ShareStorage.postComment', () => {
  it('POSTs encrypted comment and returns cmtId', async () => {
    const key = await generateKey()
    const fetchMock = makeFetchMock([{ ok: true, json: { cmtId: 'cmt1' } }])
    vi.stubGlobal('fetch', fetchMock)
    const storage = new ShareStorage(WORKER)
    const comment: PeerComment = {
      id: 'c_1', peerName: 'Alex', path: 'a.md',
      blockRef: { blockIndex: 0, contentPreview: 'intro' },
      commentType: 'fix', text: 'Fix this', createdAt: new Date().toISOString(),
    }
    const id = await storage.postComment('doc1', comment, key)
    expect(id).toBe('cmt1')
    vi.unstubAllGlobals()
  })
})

describe('ShareStorage.fetchComments', () => {
  it('decrypts all comment blobs and returns PeerComment[]', async () => {
    const key = await generateKey()
    const { encrypt } = await import('../services/crypto')
    const comment: PeerComment = {
      id: 'c_1', peerName: 'Bob', path: 'b.md',
      blockRef: { blockIndex: 1, contentPreview: 'para' },
      commentType: 'note', text: 'Looks good', createdAt: new Date().toISOString(),
    }
    const blob = await encrypt(new TextEncoder().encode(JSON.stringify(comment)), key)
    const b64 = btoa(String.fromCharCode(...new Uint8Array(blob)))
    const fetchMock = makeFetchMock([{ ok: true, json: [b64] }])
    vi.stubGlobal('fetch', fetchMock)
    const storage = new ShareStorage(WORKER)
    const comments = await storage.fetchComments('doc1', key)
    expect(comments).toHaveLength(1)
    expect(comments[0].peerName).toBe('Bob')
    vi.unstubAllGlobals()
  })
})

describe('ShareStorage.deleteComments', () => {
  it('sends DELETE /comments/:docId with X-Host-Secret', async () => {
    const fetchMock = makeFetchMock([{ ok: true, json: { ok: true } }])
    vi.stubGlobal('fetch', fetchMock)
    const storage = new ShareStorage(WORKER)
    await storage.deleteComments('doc1', 'secret42')
    expect(fetchMock).toHaveBeenCalledWith(
      `${WORKER}/comments/doc1`,
      expect.objectContaining({ method: 'DELETE' }),
    )
    vi.unstubAllGlobals()
  })
})

beforeEach(() => {
  vi.restoreAllMocks()
})
