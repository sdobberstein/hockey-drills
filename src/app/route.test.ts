import { describe, expect, it } from 'vitest'
import { drillHash, libraryHash, parseHash, sharedHash } from './route'

describe('routes', () => {
  it('shows the library for empty and unknown hashes', () => {
    for (const hash of ['', '#', '#/', '#/nonsense', '#/drill', '#/drill/', '#/d/']) {
      expect(parseHash(hash)).toEqual({ kind: 'library' })
    }
  })

  it('reads a library drill id', () => {
    expect(parseHash('#/drill/2-on-1')).toEqual({ kind: 'drill', id: '2-on-1' })
  })

  it('reads self-contained drill data', () => {
    expect(parseHash('#/d/abc_-123')).toEqual({ kind: 'shared', data: 'abc_-123' })
  })

  it('round-trips the builders', () => {
    expect(parseHash(libraryHash())).toEqual({ kind: 'library' })
    expect(parseHash(drillHash('cycle-give-and-go'))).toEqual({ kind: 'drill', id: 'cycle-give-and-go' })
    expect(parseHash(sharedHash('Zm9v'))).toEqual({ kind: 'shared', data: 'Zm9v' })
  })

  it('survives a malformed percent escape', () => {
    expect(parseHash('#/drill/100%')).toEqual({ kind: 'drill', id: '100%' })
  })
})
