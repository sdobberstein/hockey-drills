import { describe, expect, it } from 'vitest'
import { distance, nearestAlongPath, pathLength, pointAlong, smoothPath } from './geometry'

describe('geometry', () => {
  it('measures straight-line distance', () => {
    expect(distance([0, 0], [3, 4])).toBe(5)
  })

  it('sums segment lengths for a polyline', () => {
    expect(pathLength([[0, 0], [3, 4], [3, 10]])).toBe(11)
  })

  it('interpolates along a single segment', () => {
    expect(pointAlong([[0, 0], [10, 0]], 2.5)).toEqual([2.5, 0])
  })

  it('carries over into the next segment', () => {
    // 10 ft along the first segment, then 5 ft up the second.
    expect(pointAlong([[0, 0], [10, 0], [10, 20]], 15)).toEqual([10, 5])
  })

  it('clamps to the start and end of the path', () => {
    const path = [[0, 0], [10, 0]] as const
    expect(pointAlong(path, -5)).toEqual([0, 0])
    expect(pointAlong(path, 999)).toEqual([10, 0])
  })

  it('tolerates zero-length segments', () => {
    expect(pointAlong([[5, 5], [5, 5], [5, 5]], 3)).toEqual([5, 5])
  })

  it('finds the closest spot on a path and how far along it is', () => {
    // Directly beside the 15 ft mark of an L-shaped path.
    const near = nearestAlongPath([[0, 0], [10, 0], [10, 20]], [12, 5])
    expect(near.distance).toBeCloseTo(2)
    expect(near.arc).toBeCloseTo(15)
  })

  it('clamps to the ends of the path', () => {
    expect(nearestAlongPath([[0, 0], [10, 0]], [-5, 0])).toEqual({ distance: 5, arc: 0 })
    expect(nearestAlongPath([[0, 0], [10, 0]], [20, 0])).toEqual({ distance: 10, arc: 10 })
  })
})

describe('smoothPath', () => {
  const corner = [[0, 0], [20, 0], [20, 20]] as const

  it('passes exactly through every point it was given', () => {
    const out = smoothPath(corner)
    for (const p of corner) {
      expect(out.some((q) => distance(p, q) < 1e-9)).toBe(true)
    }
  })

  it('starts and ends where the path does', () => {
    const out = smoothPath(corner)
    expect(out[0]).toEqual([0, 0])
    expect(out[out.length - 1]).toEqual([20, 20])
  })

  it('is a little longer than the chords, not wildly so', () => {
    // It must pass through the corner point, so it bulges rather than cutting
    // the corner: slightly longer than the 40 ft of chords.
    const length = pathLength(smoothPath(corner))
    expect(length).toBeGreaterThan(40)
    expect(length).toBeLessThan(44)
  })

  it('turns gradually instead of in one sharp corner', () => {
    const out = smoothPath(corner)
    let sharpest = 0
    for (let i = 2; i < out.length; i++) {
      const a = Math.atan2(out[i - 1][1] - out[i - 2][1], out[i - 1][0] - out[i - 2][0])
      const b = Math.atan2(out[i][1] - out[i - 1][1], out[i][0] - out[i - 1][0])
      sharpest = Math.max(sharpest, Math.abs(b - a))
    }
    // The raw corner turns 90 degrees (pi/2) at once; the curve spreads it out.
    expect(sharpest).toBeLessThan(Math.PI / 6)
  })

  it('leaves a straight run straight', () => {
    const out = smoothPath([[0, 0], [10, 0], [20, 0]])
    expect(out.every((p) => Math.abs(p[1]) < 1e-9)).toBe(true)
  })

  it('returns two points unchanged (nothing to curve)', () => {
    expect(smoothPath([[0, 0], [10, 5]])).toEqual([[0, 0], [10, 5]])
  })

  it('keeps output points roughly a foot apart', () => {
    const out = smoothPath(corner)
    for (let i = 1; i < out.length; i++) expect(distance(out[i - 1], out[i])).toBeLessThan(1.6)
  })

  it('does not loop or overshoot wildly when points are unevenly spaced', () => {
    const out = smoothPath([[0, 0], [1, 0], [30, 0], [31, 5]])
    for (const [x, y] of out) {
      expect(x).toBeGreaterThan(-2)
      expect(x).toBeLessThan(33)
      expect(Math.abs(y)).toBeLessThan(8)
    }
  })

  it('tolerates repeated points', () => {
    const out = smoothPath([[0, 0], [0, 0], [10, 0], [10, 10]])
    expect(out[0]).toEqual([0, 0])
    expect(out[out.length - 1]).toEqual([10, 10])
  })
})
