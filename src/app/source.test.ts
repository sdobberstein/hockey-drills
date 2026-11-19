import { describe, expect, it } from 'vitest'
import { parseDrill } from '../engine/parse'
import { twoOnOne } from '../engine/fixtures'
import { setSource } from '../editor/ops'
import { creditText, sourceLink } from './source'

const withSource = (source: unknown) => JSON.parse(JSON.stringify({ ...twoOnOne, source }))

describe('a drill\'s source in the file format', () => {
  it('is optional: a drill without one is still valid', () => {
    expect(parseDrill(JSON.parse(JSON.stringify(twoOnOne))).issues).toEqual([])
  })

  it('accepts a link with the credit around it', () => {
    const r = parseDrill(withSource({ url: 'https://weisstechhockey.com/x/', title: 'X', author: 'A', site: 'S' }))
    expect(r.issues).toEqual([])
    expect(r.drill?.source?.author).toBe('A')
  })

  it('needs a link', () => {
    expect(parseDrill(withSource({ title: 'X' })).drill).toBeNull()
  })

  it('refuses anything that is not an http or https link', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://x.test/a', 'weisstechhockey.com', '//x.test', 'https://', 'https://a b']) {
      expect(parseDrill(withSource({ url })).drill, url).toBeNull()
    }
  })

  it('refuses keys it does not know about', () => {
    expect(parseDrill(withSource({ url: 'https://x.test/', licence: 'MIT' })).drill).toBeNull()
  })
})

describe('sourceLink: the only thing that decides whether a source becomes a link', () => {
  it('gives http and https links back', () => {
    expect(sourceLink({ url: 'https://weisstechhockey.com/attack-triangle-sequence/' })).toBe('https://weisstechhockey.com/attack-triangle-sequence/')
    expect(sourceLink({ url: 'http://example.com/a' })).toBe('http://example.com/a')
  })

  it('refuses everything else, even if it got past the schema', () => {
    for (const url of ['javascript:alert(document.cookie)', ' javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', 'not a url', '']) {
      expect(sourceLink({ url }), url).toBeNull()
    }
    expect(sourceLink(undefined)).toBeNull()
  })
})

describe('creditText', () => {
  it('names the original, its author and its site', () => {
    expect(creditText({ url: 'https://x.test/', title: 'Cycle Give and Go Drill', author: 'Jeremy Weiss', site: 'Weiss Tech Hockey' }, 'Ours')).toBe(
      'Cycle Give and Go Drill by Jeremy Weiss, Weiss Tech Hockey',
    )
  })

  it('falls back to our own title, and skips what is missing', () => {
    expect(creditText({ url: 'https://x.test/' }, 'Ours')).toBe('Ours')
    expect(creditText({ url: 'https://x.test/', author: ' A ' }, 'Ours')).toBe('Ours by A')
  })
})

describe('setSource (the editor fields)', () => {
  it('adds a source from a link and fills in the rest as they are typed', () => {
    const a = setSource(twoOnOne, { url: ' https://x.test/a ' })
    expect(a.source).toEqual({ url: 'https://x.test/a' })
    const b = setSource(a, { author: 'Jeremy Weiss' })
    expect(b.source).toEqual({ url: 'https://x.test/a', author: 'Jeremy Weiss' })
  })

  it('leaves out a part that is emptied', () => {
    const a = setSource(setSource(twoOnOne, { url: 'https://x.test/' }), { title: 'T' })
    expect(setSource(a, { title: '  ' }).source).toEqual({ url: 'https://x.test/' })
  })

  it('removes the source when the link is cleared, since the link is what makes it one', () => {
    const a = setSource(setSource(twoOnOne, { url: 'https://x.test/' }), { author: 'A' })
    expect('source' in setSource(a, { url: '' })).toBe(false)
  })

  it('does not change the drill it was given', () => {
    const before = JSON.stringify(twoOnOne)
    setSource(twoOnOne, { url: 'https://x.test/' })
    expect(JSON.stringify(twoOnOne)).toBe(before)
  })
})

describe('the credit travels', () => {
  const credited = setSource(twoOnOne, { url: 'https://x.test/orig', author: 'Jeremy Weiss' })

  it('with an edited copy of the drill', async () => {
    const { copyForEditing } = await import('../editor/ops')
    expect(copyForEditing(credited, new Set()).source).toEqual(credited.source)
  })

  it('through an edit in the flow view, which compiles the steps again', async () => {
    const { editViaFlow } = await import('../flow/apply')
    const result = editViaFlow(credited, (f) => f)
    expect(result?.drill.source).toEqual(credited.source)
  })
})
