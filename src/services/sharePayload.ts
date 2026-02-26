import { compress, decompress } from './compress'
import type { SharePayload } from '../types/share'

export async function serializePayload(tree: Record<string, string>): Promise<Uint8Array> {
  const payload: SharePayload = {
    version: '2.0',
    created_at: new Date().toISOString(),
    tree,
  }
  const json = JSON.stringify(payload)
  return compress(new TextEncoder().encode(json))
}

export async function deserializePayload(compressed: Uint8Array): Promise<SharePayload> {
  const raw = await decompress(compressed)
  return JSON.parse(new TextDecoder().decode(raw)) as SharePayload
}
