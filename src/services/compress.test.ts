import { describe, it, expect } from 'vitest'
import { compress, decompress } from './compress'

describe('compress / decompress', () => {
  it('round-trips UTF-8 text', async () => {
    const text = 'Hello, lollipop dragon! '.repeat(100)
    const data = new TextEncoder().encode(text)
    const compressed = await compress(data)
    const recovered = await decompress(compressed)
    expect(new TextDecoder().decode(recovered)).toBe(text)
  })

  it('compresses repetitive data to smaller size', async () => {
    const data = new TextEncoder().encode('a'.repeat(10000))
    const compressed = await compress(data)
    expect(compressed.byteLength).toBeLessThan(data.byteLength)
  })

  it('handles empty input', async () => {
    const data = new Uint8Array(0)
    const compressed = await compress(data)
    const recovered = await decompress(compressed)
    expect(recovered.byteLength).toBe(0)
  })
})
