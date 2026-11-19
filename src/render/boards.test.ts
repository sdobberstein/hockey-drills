import { describe, expect, it } from 'vitest'
import { nearestBoard, RINK } from './rinkGeometry'

describe('nearestBoard', () => {
  it('snaps to the straight walls', () => {
    expect(nearestBoard([100, 5]).point).toEqual([100, 0])
    expect(nearestBoard([100, 80]).point).toEqual([100, RINK.width])
    expect(nearestBoard([6, 42]).point).toEqual([0, 42])
    expect(nearestBoard([190, 42]).point).toEqual([RINK.length, 42])
  })

  it('says how far the wall is', () => {
    expect(nearestBoard([100, 5]).distance).toBeCloseTo(5)
    expect(nearestBoard([100, 42.5]).distance).toBeCloseTo(42.5) // centre ice: far from everything
  })

  it('follows the rounded corner, which is closer than the straight lines would say', () => {
    // [8, 8] is 20 ft from each wall's line, but the corner is cut: the arc is centred at (28, 28)
    // with radius 28, so the boards are only |20 * sqrt(2) - 28| = 0.28 ft away.
    const { point, distance } = nearestBoard([8, 8])
    expect(Math.hypot(point[0] - RINK.cornerRadius, point[1] - RINK.cornerRadius)).toBeCloseTo(RINK.cornerRadius)
    expect(distance).toBeCloseTo(Math.abs(20 * Math.SQRT2 - RINK.cornerRadius), 6)
    expect(distance).toBeLessThan(0.5)
  })

  it('treats the cut-off corner as off the ice: a spot out there is measured to the arc', () => {
    // (200, 10) is outside the rounded rectangle, so it is not on the boards: the arc is 5.29 ft away.
    expect(nearestBoard([RINK.length, 10]).distance).toBeCloseTo(Math.hypot(28, 18) - RINK.cornerRadius, 6)
  })

  it('a point on a wall or on a corner arc is its own nearest board', () => {
    for (const p of [[100, 0], [0, 40], [RINK.length, 42], [60, RINK.width]] as const) expect(nearestBoard(p).distance).toBeCloseTo(0, 6)
    const onArc: [number, number] = [RINK.cornerRadius - RINK.cornerRadius * Math.SQRT1_2, RINK.cornerRadius - RINK.cornerRadius * Math.SQRT1_2]
    expect(nearestBoard(onArc).distance).toBeCloseTo(0, 6)
  })
})
