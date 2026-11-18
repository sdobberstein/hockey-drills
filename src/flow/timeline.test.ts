import { describe, expect, it } from 'vitest'
import { markerAtTime, markerPoint, markerTime, positionAtTime, segmentsFor } from './timeline'

describe('the flow timeline', () => {
  const pieces = [
    { kind: 'run' as const, style: 'skate' as const, points: [[0, 0], [50, 0]] as [number, number][] }, // 2 s at 25 ft/s
    { kind: 'wait' as const, seconds: 1 },
    { kind: 'run' as const, style: 'skate' as const, speed: 10, points: [[50, 0], [50, 20]] as [number, number][] }, // 2 s
  ]
  const segs = segmentsFor(pieces, [0, 0])

  it('lays pieces end to end on one clock', () => {
    expect(segs.map((s) => [s.t0, s.t1])).toEqual([[0, 2], [2, 3], [3, 5]])
  })

  it('finds where a skater is at a moment, including while waiting', () => {
    expect(positionAtTime(segs, [0, 0], 1)).toEqual([25, 0])
    expect(positionAtTime(segs, [0, 0], 2.5)).toEqual([50, 0]) // standing
    expect(positionAtTime(segs, [0, 0], 4)).toEqual([50, 10])
    expect(positionAtTime(segs, [0, 0], 99)).toEqual([50, 20]) // done: stays put
  })

  it('turns a moment into a marker and a marker back into the same moment', () => {
    for (const t of [0.5, 1.7, 2.4, 3.9]) {
      const marker = markerAtTime(segs, 'F1', t)!
      expect(markerTime(segs, marker)).toBeCloseTo(t, 6)
    }
  })

  it('puts a marker at a shared instant in the later piece', () => {
    expect(markerAtTime(segs, 'F1', 2)).toEqual({ actor: 'F1', piece: 1, at: 0 })
  })

  it('gives the point a marker names', () => {
    expect(markerPoint(segs, { actor: 'F1', piece: 0, at: 20 }, [0, 0])).toEqual([20, 0])
    expect(markerPoint(segs, { actor: 'F1', piece: 1, at: 0.5 }, [0, 0])).toEqual([50, 0]) // a wait
  })
})
