import { describe, it, expect } from 'vitest'
import { serializePayload, deserializePayload } from '../services/sharePayload'

describe('serializePayload / deserializePayload', () => {
  it('round-trips a folder tree', async () => {
    const tree = {
      'README.md': '# Hello\n\nThis is a test.',
      'docs/overview.md': '## Overview\n\nDetails here.',
    }
    const compressed = await serializePayload(tree)
    const payload = await deserializePayload(compressed)
    expect(payload.version).toBe('2.0')
    expect(payload.tree).toEqual(tree)
    expect(payload.created_at).toBeTruthy()
  })

  it('produces a Uint8Array', async () => {
    const compressed = await serializePayload({ 'a.md': '# A' })
    expect(compressed).toBeInstanceOf(Uint8Array)
  })
})
