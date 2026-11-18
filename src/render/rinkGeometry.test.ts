import { describe, expect, it } from 'vitest'
import { viewBoxFor } from './rinkGeometry'

describe('viewBoxFor', () => {
  it('shows the whole rink with a margin', () => {
    expect(viewBoxFor('full')).toBe('-3 -3 206 91')
  })

  it('crops half views without changing coordinates', () => {
    // The right half starts at the red line (x = 100), minus the margin.
    expect(viewBoxFor('half-right')).toBe('97 -3 106 91')
    expect(viewBoxFor('half-left')).toBe('-3 -3 106 91')
    expect(viewBoxFor('half-top')).toBe('-3 -3 206 48.5')
    expect(viewBoxFor('half-bottom')).toBe('-3 39.5 206 48.5')
  })
})
