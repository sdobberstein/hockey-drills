import { describe, expect, it } from 'vitest'
import { clone, cycleGiveAndGo, twoOnOne } from '../engine/fixtures'
import { decode, encode, MAX_DRILL_BYTES } from './codec'

describe('share codec', () => {
  it('round-trips a drill exactly', async () => {
    expect(await decode(await encode(twoOnOne))).toEqual(twoOnOne)
    expect(await decode(await encode(cycleGiveAndGo))).toEqual(cycleGiveAndGo)
  })

  it('produces URL-safe text', async () => {
    expect(await encode(twoOnOne)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('is much shorter than the raw JSON', async () => {
    const text = await encode(cycleGiveAndGo)
    expect(text.length).toBeLessThan(JSON.stringify(cycleGiveAndGo).length / 2)
  })

  it('keeps unicode in titles', async () => {
    const d = clone(twoOnOne)
    d.title = 'Zone entry: déjà vu 🏒'
    expect((await decode(await encode(d)) as typeof d).title).toBe(d.title)
  })

  it('rejects text that is not base64url', async () => {
    await expect(decode('not valid!!')).rejects.toThrow()
  })

  it('rejects data that is not compressed', async () => {
    await expect(decode('aGVsbG8gd29ybGQ')).rejects.toThrow()
  })

  it('rejects valid compressed data that is not JSON', async () => {
    // encode() always writes JSON, so compress some non-JSON bytes ourselves.
    const stream = new CompressionStream('deflate-raw')
    const writer = stream.writable.getWriter()
    void writer.write(new TextEncoder().encode('this is not json')).then(() => writer.close())
    const bytes = new Uint8Array(await new Response(stream.readable).arrayBuffer())
    let binary = ''
    for (const b of bytes) binary += String.fromCharCode(b)
    const notJson = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    await expect(decode(notJson)).rejects.toThrow()
  })

  it('refuses to inflate past the size limit (zip bomb guard)', async () => {
    // A few KB of zeros compress to almost nothing but inflate past the cap.
    const huge = 'a'.repeat(MAX_DRILL_BYTES * 2)
    await expect(decode(await encode(huge))).rejects.toThrow(/too large/)
  })
})
