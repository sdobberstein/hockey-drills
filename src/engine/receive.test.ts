import { describe, expect, it } from 'vitest'
import { distance, pathLength } from './geometry'
import { landingSpot } from './receive'

describe('landingSpot', () => {
  it('lands on a standing receiver', () => {
    expect(landingSpot([0, 0], 50, undefined, 25, [30, 10])).toEqual([30, 10])
  })

  it('finds the spot where puck and skater arrive together', () => {
    const release = [0, 0] as const
    const route = [[40, 20], [60, 20]] as const
    // 80 ft/s is fast enough to meet the skater part-way along the route.
    const spot = landingSpot(release, 80, route, 20, [40, 20])

    const puckTime = distance(release, spot) / 80
    const skaterTime = (spot[0] - 40) / 20 // spot is on the route, which runs along x
    expect(puckTime).toBeCloseTo(skaterTime, 3)
    expect(spot[0]).toBeGreaterThan(40)
    expect(spot[0]).toBeLessThan(60)
  })

  it('leads the receiver further ahead for a slower pass', () => {
    const route = [[40, 20], [80, 20]] as const
    const fast = landingSpot([0, 0], 80, route, 20, [40, 20])
    const slow = landingSpot([0, 0], 30, route, 20, [40, 20])
    expect(slow[0]).toBeGreaterThan(fast[0])
  })

  it('lands at the end of the route if the receiver gets there first', () => {
    const route = [[40, 20], [45, 20]] as const // a 5 ft route: ~0.25 s
    const spot = landingSpot([0, 0], 10, route, 20, [40, 20]) // a slow pass: 4+ s
    expect(spot).toEqual([45, 20])
    expect(pathLength(route)).toBe(5)
  })
})
