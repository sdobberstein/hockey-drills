import { describe, expect, it } from 'vitest'
import { arrowHead, buildSampler, lineArt, wavePoints } from './lineGeometry'

const horizontal = [[0, 0], [20, 0]] as const

describe('buildSampler', () => {
  it('reports position and heading along a bent path', () => {
    const s = buildSampler([[0, 0], [10, 0], [10, 10]])
    expect(s.length).toBe(20)
    expect(s.at(5)).toEqual({ point: [5, 0], tangent: [1, 0] })
    expect(s.at(15)).toEqual({ point: [10, 5], tangent: [0, 1] })
  })
})

describe('wavePoints', () => {
  const wave = wavePoints(horizontal, 5, 1)

  it('starts and ends exactly on the path', () => {
    expect(wave[0]).toEqual([0, 0])
    const last = wave[wave.length - 1]
    expect(last[0]).toBeCloseTo(20)
    expect(last[1]).toBeCloseTo(0)
  })

  it('swings to the amplitude on both sides but no further', () => {
    const ys = wave.map((p) => p[1])
    expect(Math.max(...ys)).toBeGreaterThan(0.9)
    expect(Math.min(...ys)).toBeLessThan(-0.9)
    expect(Math.max(...ys.map(Math.abs))).toBeLessThanOrEqual(1 + 1e-9)
  })
})

describe('arrowHead', () => {
  it('puts both barbs behind the tip, on either side of the path', () => {
    const [a, tip, b] = arrowHead([10, 0], [1, 0])
    expect(tip).toEqual([10, 0])
    expect(a[0]).toBeLessThan(10)
    expect(b[0]).toBeLessThan(10)
    expect(a[1] * b[1]).toBeLessThan(0)
  })
})

describe('lineArt', () => {
  it('draws nothing for a zero-length path', () => {
    expect(lineArt('skate', [[1, 1], [1, 1]])).toEqual([])
  })

  it('draws a plain skate as a line plus an arrowhead', () => {
    const strokes = lineArt('skate', horizontal)
    expect(strokes).toHaveLength(2)
    expect(strokes[0].points).toEqual([[0, 0], [20, 0]])
  })

  it('dashes passes', () => {
    expect(lineArt('pass', horizontal)[0].dash).toBeDefined()
  })

  it('draws a shot as a thick line with a knockout channel', () => {
    const strokes = lineArt('shoot', horizontal)
    expect(strokes.some((s) => s.knockout)).toBe(true)
    expect(strokes[0].width).toBeGreaterThan(strokes[1].width)
  })

  it('draws lateral movement as ticks across the path', () => {
    const ticks = lineArt('lateral', horizontal).slice(1)
    expect(ticks.length).toBeGreaterThan(5)
    for (const t of ticks) {
      expect(t.points[0][0]).toBeCloseTo(t.points[1][0]) // same x: perpendicular to the path
      expect(t.points[0][1]).not.toBeCloseTo(t.points[1][1])
    }
  })

  it('ends a stop with two bars and a check with one', () => {
    const bars = (style: 'stop' | 'check') => lineArt(style, horizontal).filter((s) => s.points[0][0] === s.points[1][0])
    expect(bars('stop')).toHaveLength(2)
    expect(bars('check')).toHaveLength(1)
  })

  it('produces some art for every style', () => {
    for (const style of ['skate', 'skate-puck', 'backward', 'lateral', 'pivot', 'pass', 'shoot', 'stop', 'drop-pass', 'check'] as const) {
      expect(lineArt(style, [[0, 0], [10, 5], [20, 5]]).length).toBeGreaterThan(0)
    }
  })
})
