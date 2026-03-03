// AES-256-GCM client-side encryption via Web Crypto API.
// The 12-byte IV is prepended to the ciphertext so decrypt only needs
// the single combined buffer plus the key.

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function keyToBase64url(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  return btoa(String.fromCharCode(...new Uint8Array(raw)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function base64urlToKey(b64: string): Promise<CryptoKey> {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    b64.length + ((4 - (b64.length % 4)) % 4), '=',
  )
  const raw = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function docIdFromKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  const hash = await crypto.subtle.digest('SHA-256', raw)
  const bytes = new Uint8Array(hash, 0, 16)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function encrypt(plaintext: Uint8Array, key: CryptoKey): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  const result = new Uint8Array(12 + ciphertext.byteLength)
  result.set(iv, 0)
  result.set(new Uint8Array(ciphertext), 12)
  return result.buffer
}

export async function decrypt(blob: ArrayBuffer, key: CryptoKey): Promise<Uint8Array> {
  const iv = new Uint8Array(blob, 0, 12)
  const ciphertext = new Uint8Array(blob, 12)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new Uint8Array(plaintext)
}
