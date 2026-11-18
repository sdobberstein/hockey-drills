import { describe, expect, it } from 'vitest'
import { clone, twoOnOne } from '../engine/fixtures'
import type { Drill } from '../engine/types'
import { buildLibrary, neighbours, seriesTitle } from './library'

const drill = (id: string, title: string, progression?: Drill['progression']): Drill => ({
  ...clone(twoOnOne),
  id,
  title,
  progression,
})

describe('buildLibrary', () => {
  it('lists drills without a progression as single entries', () => {
    const entries = buildLibrary([drill('a', 'Alpha'), drill('b', 'Bravo')])
    expect(entries.map((e) => [e.kind, e.title])).toEqual([['single', 'Alpha'], ['single', 'Bravo']])
  })

  it('groups a progression, ordered by position not by title', () => {
    const entries = buildLibrary([
      drill('z', 'Z last in title', { series: 'rush', order: 1 }),
      drill('a', 'A first in title', { series: 'rush', order: 2 }),
    ])
    expect(entries).toHaveLength(1)
    const [entry] = entries
    expect(entry.kind).toBe('series')
    if (entry.kind === 'series') {
      expect(entry.title).toBe('Rush')
      expect(entry.drills.map((d) => d.id)).toEqual(['z', 'a'])
    }
  })

  it('shows a series of one as a plain drill', () => {
    const [entry] = buildLibrary([drill('solo', 'Solo', { series: 'lonely', order: 1 })])
    expect(entry.kind).toBe('single')
  })

  it('sorts entries by title, mixing singles and series', () => {
    const entries = buildLibrary([
      drill('s2', 'S2', { series: 'zebra', order: 2 }),
      drill('s1', 'S1', { series: 'zebra', order: 1 }),
      drill('m', 'Middle'),
      drill('a', 'Apple'),
    ])
    expect(entries.map((e) => e.title)).toEqual(['Apple', 'Middle', 'Zebra'])
  })
})

describe('neighbours', () => {
  const all = [
    drill('one', 'One', { series: 's', order: 1 }),
    drill('two', 'Two', { series: 's', order: 2 }),
    drill('three', 'Three', { series: 's', order: 3 }),
    drill('other', 'Other', { series: 't', order: 1 }),
    drill('plain', 'Plain'),
  ]

  it('finds previous and next inside the series only', () => {
    const n = neighbours(all, all[1])!
    expect(n.previous?.id).toBe('one')
    expect(n.next?.id).toBe('three')
    expect([n.position, n.total]).toEqual([2, 3])
  })

  it('has no previous at the start and no next at the end', () => {
    expect(neighbours(all, all[0])!.previous).toBeUndefined()
    expect(neighbours(all, all[2])!.next).toBeUndefined()
  })

  it('returns nothing for a drill with no progression or a series of one', () => {
    expect(neighbours(all, all[4])).toBeNull()
    expect(neighbours(all, all[3])).toBeNull()
  })
})

describe('seriesTitle', () => {
  it('turns a slug into a title', () => {
    expect(seriesTitle('cycle-give-and-go')).toBe('Cycle give and go')
  })
})
