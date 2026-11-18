/**
 * Turn a drill into a short, URL-safe string and back, so a link can carry the
 * whole drill with no server (PLAN.md, "Sharing").
 *
 * JSON -> UTF-8 bytes -> deflate -> base64url. The browser's built-in
 * CompressionStream does the deflate, so there is no library. "deflate-raw"
 * omits the zlib header and checksum, which saves a few bytes per link.
 * Drill JSON is repetitive, so it compresses well: a typical drill comes out
 * at a few hundred characters.
 */

/**
 * Upper bound on the decompressed size we are willing to read. A link is
 * untrusted input, and a tiny payload can inflate to gigabytes (a "zip
 * bomb"), so we stop reading rather than trust the data. Real drills are a
 * few KB.
 */
export const MAX_DRILL_BYTES = 256 * 1024

export async function encode(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  return toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')))
}

/** Throws if the text is not valid base64url, not deflate data, too big, or not JSON. */
export async function decode(text: string): Promise<unknown> {
  const compressed = fromBase64Url(text)
  const bytes = await pipe(compressed, new DecompressionStream('deflate-raw'), MAX_DRILL_BYTES)
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** Run bytes through a transform stream, optionally refusing to read past `limit` bytes out. */
async function pipe(
  input: Uint8Array,
  stream: CompressionStream | DecompressionStream,
  limit = Infinity,
): Promise<Uint8Array> {
  // Start reading before writing: the stream's buffer is small, so writing
  // everything first would deadlock on large inputs.
  const reader = stream.readable.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  const reading = (async () => {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      size += value.length
      if (size > limit) {
        await reader.cancel()
        throw new Error('The drill data is too large.')
      }
      chunks.push(value)
    }
  })()

  const writer = stream.writable.getWriter()
  // Errors surface through the read side, so ignore the write side's rejection.
  writer.write(input as BufferSource).then(() => writer.close()).catch(() => {})
  await reading

  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  // base64url: + and / swapped for URL-safe characters, padding dropped.
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('The link is not valid.')
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}
