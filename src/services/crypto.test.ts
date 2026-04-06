import { describe, it, expect } from 'vitest'
import { generateKey, encrypt, decrypt, keyToBase64url, base64urlToKey } from './crypto'

describe('generateKey', () => {
  it('produces an AES-GCM CryptoKey', async () => {
    const key = await generateKey()
    expect(key.type).toBe('secret')
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 })
  })
})

describe('keyToBase64url / base64urlToKey', () => {
  it('round-trips the key without padding or special chars', async () => {
    const key = await generateKey()
    const b64 = await keyToBase64url(key)
    expect(b64).not.toMatch(/[+/=]/)
    const recovered = await base64urlToKey(b64)
    // Both should produce the same raw bytes
    const raw1 = new Uint8Array(await crypto.subtle.exportKey('raw', key))
    const raw2 = new Uint8Array(await crypto.subtle.exportKey('raw', recovered))
    expect(raw1).toEqual(raw2)
  })
})

describe('encrypt / decrypt', () => {
  it('round-trips arbitrary binary data', async () => {
    const key = await generateKey()
    const plaintext = new TextEncoder().encode('Hello, lollipop dragon!')
    const ciphertext = await encrypt(plaintext, key)
    const recovered = await decrypt(ciphertext, key)
    expect(new TextDecoder().decode(recovered)).toBe('Hello, lollipop dragon!')
  })

  it('produces different ciphertext each time (random IV)', async () => {
    const key = await generateKey()
    const plaintext = new TextEncoder().encode('same input')
    const c1 = await encrypt(plaintext, key)
    const c2 = await encrypt(plaintext, key)
    expect(new Uint8Array(c1)).not.toEqual(new Uint8Array(c2))
  })

  it('ciphertext is 12 bytes (IV) longer than plaintext + GCM tag (16)', async () => {
    const key = await generateKey()
    const plaintext = new Uint8Array(100)
    const ciphertext = await encrypt(plaintext, key)
    expect(ciphertext.byteLength).toBe(12 + 100 + 16)
  })

  it('rejects decryption with wrong key', async () => {
    const key1 = await generateKey()
    const key2 = await generateKey()
    const ciphertext = await encrypt(new TextEncoder().encode('secret'), key1)
    await expect(decrypt(ciphertext, key2)).rejects.toThrow()
  })
})
