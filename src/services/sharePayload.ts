import { compress, decompress } from './compress'
import type { SharePayload } from '../types/share'

function isSharePayload(value: unknown): value is SharePayload {
  if (typeof value !== 'object' || value === null) return false
  return (
    'version' in value && value.version === '2.0' &&
    'created_at' in value && typeof value.created_at === 'string' &&
    'tree' in value && typeof value.tree === 'object' &&
    value.tree !== null
  )
}

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
  const parsed: unknown = JSON.parse(new TextDecoder().decode(raw))
  if (!isSharePayload(parsed)) throw new Error('Invalid share payload')
  return parsed
}
