// Gzip compression/decompression via the Compression Streams API.
// Uses ReadableStream directly (avoids Blob.stream which is absent in jsdom).

async function readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) { out.set(c, offset); offset += c.length }
  return out
}

function toReadable(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) { controller.enqueue(data); controller.close() },
  })
}

export async function compress(data: Uint8Array): Promise<Uint8Array> {
  return readStream(toReadable(data).pipeThrough(new CompressionStream('gzip')))
}

export async function decompress(data: Uint8Array): Promise<Uint8Array> {
  return readStream(toReadable(data).pipeThrough(new DecompressionStream('gzip')))
}
