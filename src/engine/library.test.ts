import { describe, expect, it } from 'vitest'
import { validateDrill } from './validate'
import type { Drill } from './types'

/**
 * Every drill file in drills/ must be valid, so a hand-edited drill that
 * would animate wrongly fails here rather than in the browser.
 */
const files = import.meta.glob('../../drills/*.json', { eager: true, import: 'default' })

describe('drill library', () => {
  const entries = Object.entries(files) as [string, Drill][]

  it('finds drills', () => {
    expect(entries.length).toBeGreaterThan(0)
  })

  it('uses unique ids', () => {
    const ids = entries.map(([, d]) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives each drill in a progression a unique position', () => {
    const seen = new Set<string>()
    for (const [, d] of entries) {
      if (!d.progression) continue
      const key = `${d.progression.series}#${d.progression.order}`
      expect(seen.has(key), `duplicate progression slot ${key}`).toBe(false)
      seen.add(key)
    }
  })

  for (const [path, drill] of entries) {
    describe(path, () => {
      it('is named after its id', () => {
        expect(path.endsWith(`/${drill.id}.json`)).toBe(true)
      })

      it('passes semantic validation', () => {
        expect(validateDrill(drill)).toEqual([])
      })
    })
  }
})
