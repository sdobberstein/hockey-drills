import { describe, expect, it } from 'vitest'
import { distance, pathLength, pointAlong } from './geometry'

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
})
