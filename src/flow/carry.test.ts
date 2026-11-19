import { describe, expect, it } from 'vitest'
import type { Point } from '../engine/types'
import { carryStretches } from './carry'

/** A straight 100 ft run along y = 0, skated at 10 ft/s from t = 2 to t = 12. */
const geometry: Point[] = [[0, 0], [100, 0]]
const run = { t0: 2, t1: 12, speed: 10, length: 100 }

describe('carryStretches', () => {
  it('is one stretch when the skater has the puck all the way', () => {
    const s = carryStretches(geometry, run, [{ t0: 0, t1: Infinity }])
    expect(s).toHaveLength(1)
    expect(s[0].carrying).toBe(true)
  })

  it('is one plain stretch when they never have it', () => {
    const s = carryStretches(geometry, run, [])
    expect(s).toHaveLength(1)
    expect(s[0].carrying).toBe(false)
  })

  it('splits at the catch: plain, then with the puck', () => {
    // The puck arrives at t = 7, which is 50 ft along.
    const s = carryStretches(geometry, run, [{ t0: 7, t1: Infinity }])
    expect(s.map((x) => x.carrying)).toEqual([false, true])
    expect(s[0].points[s[0].points.length - 1][0]).toBeCloseTo(50)
    expect(s[1].points[0][0]).toBeCloseTo(50)
  })

  it('splits at the release: with the puck, then plain', () => {
    const s = carryStretches(geometry, run, [{ t0: 0, t1: 4 }]) // lets go at t = 4, 20 ft along
    expect(s.map((x) => x.carrying)).toEqual([true, false])
    expect(s[0].points[s[0].points.length - 1][0]).toBeCloseTo(20)
  })

  it('has a with-puck stretch in the middle when they have it only for a while', () => {
    const s = carryStretches(geometry, run, [{ t0: 5, t1: 9 }])
    expect(s.map((x) => x.carrying)).toEqual([false, true, false])
  })

  it('joins the stretches end to end, covering the whole run', () => {
    const s = carryStretches(geometry, run, [{ t0: 5, t1: 9 }])
    expect(s[0].points[0][0]).toBeCloseTo(0)
    expect(s[2].points[s[2].points.length - 1][0]).toBeCloseTo(100)
  })
})
