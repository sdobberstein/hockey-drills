import { describe, expect, it } from 'vitest'
import { hashMarks, RINK, viewAspect, viewBoxFor } from './rinkGeometry'

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

describe('viewAspect', () => {
  it('is wide for the full rink and tall for a half rink', () => {
    expect(viewAspect('full')).toBeCloseTo(206 / 91)
    expect(viewAspect('half-right')).toBeCloseTo(106 / 91)
  })
})

describe('hashMarks', () => {
  const marks = hashMarks(31, 20.5)

  it('has four: two at the top of the circle and two at the bottom', () => {
    expect(marks).toHaveLength(4)
  })

  it('puts each just outside the circle, 2 ft long, running away from it', () => {
    for (const [, y1, , y2] of marks) {
      const dist = (y: number) => Math.abs(y - 20.5)
      expect(dist(y1)).toBeCloseTo(RINK.faceoffRadius)
      expect(dist(y2)).toBeCloseTo(RINK.faceoffRadius + RINK.hashLength)
    }
    // Each is a straight line parallel to the goal line (same x at both ends).
    for (const [x1, , x2] of marks) expect(x1).toBe(x2)
  })

  it('has the two at each end 5 ft 11 in apart', () => {
    const top = marks.filter(([, y1]) => y1 < 20.5).map(([x]) => x).sort((a, b) => a - b)
    expect(top[1] - top[0]).toBeCloseTo(5 + 11 / 12, 1)
    expect((top[0] + top[1]) / 2).toBeCloseTo(31)
  })
})
