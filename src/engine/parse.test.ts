import { describe, expect, it } from 'vitest'
import { clone, twoOnOne } from './fixtures'
import { parseDrill } from './parse'

describe('parseDrill', () => {
  it('accepts a good drill', () => {
    const result = parseDrill(clone(twoOnOne))
    expect(result.issues).toEqual([])
    expect(result.drill?.id).toBe('2-on-1')
  })

  it('rejects things that are not drills at all', () => {
    for (const junk of [null, 42, 'drill', [], {}]) {
      const result = parseDrill(junk)
      expect(result.drill).toBeNull()
      expect(result.issues.length).toBeGreaterThan(0)
    }
  })

  it('names the field that is wrong', () => {
    const bad = clone(twoOnOne) as unknown as Record<string, unknown>
    bad.rink = 'sideways'
    const result = parseDrill(bad)
    expect(result.issues[0].code).toBe('schema')
    expect(result.issues[0].location).toBe('rink')
    expect(result.issues[0].message).toContain('half-right') // lists the allowed values
  })

  it('rejects a point outside the rink', () => {
    const bad = clone(twoOnOne)
    bad.actors[0].start = [250, 10]
    expect(parseDrill(bad).issues.some((i) => i.location === 'actors.0.start.0')).toBe(true)
  })

  it('rejects a move that has both points and a target', () => {
    const bad = clone(twoOnOne)
    const move = bad.steps[0].moves[0] as unknown as Record<string, unknown>
    move.to = [10, 10]
    expect(parseDrill(bad).drill).toBeNull()
  })

  it('rejects unknown properties, so typos are not silently ignored', () => {
    const bad = clone(twoOnOne) as unknown as Record<string, unknown>
    bad.titel = 'oops'
    expect(parseDrill(bad).drill).toBeNull()
  })

  it('runs the semantic checks once the structure is fine', () => {
    const bad = clone(twoOnOne)
    bad.steps[0].moves[0].actor = 'ghost'
    const result = parseDrill(bad)
    expect(result.drill).toBeNull()
    expect(result.issues[0].code).toBe('unknown-actor')
  })

  it('caps how many structural problems it reports', () => {
    const bad = { version: 2, id: 1, title: 2, rink: 3, actors: 4, steps: 5, tags: 6, extra: 7 }
    expect(parseDrill(bad).issues.length).toBeLessThanOrEqual(20)
  })
})
