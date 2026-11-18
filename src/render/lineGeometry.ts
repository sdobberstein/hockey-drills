import { distance } from '../engine/geometry'
import type { MoveStyle, Point } from '../engine/types'

/**
 * Pure geometry for the International Drill Symbols line styles. Everything
 * here is numbers in, numbers out (feet), so it is easy to test; the React
 * components only draw what lineArt() returns.
 */

export interface Stroke {
  points: Point[]
  /** Line width in feet. */
  width: number
  /** SVG dash pattern, in feet. */
  dash?: string
  /**
   * Draw in the rink's background colour instead of ink. Used to cut a
   * channel out of a thick line, which gives the "double line" shot symbol
   * without having to offset a polyline.
   */
  knockout?: boolean
}

const INK = 0.45
const HEAD_SIZE = 2.2
const HEAD_ANGLE = (26 * Math.PI) / 180

type Vec = readonly [number, number]

const unit = (a: Point, b: Point): Vec => {
  const d = distance(a, b)
  return d === 0 ? [1, 0] : [(b[0] - a[0]) / d, (b[1] - a[1]) / d]
}
const rotate = ([x, y]: Vec, angle: number): Vec => [
  x * Math.cos(angle) - y * Math.sin(angle),
  x * Math.sin(angle) + y * Math.cos(angle),
]
const add = (p: Point, v: Vec, k = 1): Point => [p[0] + v[0] * k, p[1] + v[1] * k]
const normalOf = ([x, y]: Vec): Vec => [-y, x]

/** Drop consecutive duplicate points so every segment has a direction. */
function dedupe(points: readonly Point[]): Point[] {
  return points.filter((p, i) => i === 0 || distance(points[i - 1], p) > 1e-6)
}

export interface Sample {
  point: Point
  /** Unit direction of travel at this point. */
  tangent: Vec
}

export interface Sampler {
  length: number
  at(s: number): Sample
}

/** Look up position and heading `s` feet along a polyline. */
export function buildSampler(points: readonly Point[]): Sampler {
  const cumulative = [0]
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]))
  }
  const length = cumulative[cumulative.length - 1]

  return {
    length,
    at(s) {
      const d = Math.min(Math.max(s, 0), length)
      let i = 1
      while (i < points.length - 1 && cumulative[i] < d) i++
      const a = points[i - 1]
      const b = points[i]
      const f = (d - cumulative[i - 1]) / (cumulative[i] - cumulative[i - 1])
      return {
        point: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f],
        tangent: unit(a, b),
      }
    },
  }
}

/**
 * Offset a polyline sideways by a sine wave. The wave eases to zero over the
 * last half-wavelength so the line lands exactly on the path's end, where the
 * arrowhead sits.
 */
export function wavePoints(
  points: readonly Point[],
  wavelength: number,
  amplitude: number,
  step = 0.3,
): Point[] {
  const sampler = buildSampler(points)
  const out: Point[] = []
  const count = Math.max(1, Math.ceil(sampler.length / step))
  for (let i = 0; i <= count; i++) {
    const s = (sampler.length * i) / count
    const { point, tangent } = sampler.at(s)
    const taper = Math.min(1, (sampler.length - s) / (wavelength / 2))
    const offset = amplitude * taper * Math.sin((2 * Math.PI * s) / wavelength)
    out.push(add(point, normalOf(tangent), offset))
  }
  return out
}

/** An open V whose point is `tip`, for a line heading in direction `dir`. */
export function arrowHead(tip: Point, dir: Vec, size = HEAD_SIZE): Point[] {
  return [add(tip, rotate(dir, Math.PI - HEAD_ANGLE), size), tip, add(tip, rotate(dir, Math.PI + HEAD_ANGLE), size)]
}

/** A segment across the path at `point`, `length` feet long. */
function bar(point: Point, tangent: Vec, length: number): Point[] {
  const n = normalOf(tangent)
  return [add(point, n, length / 2), add(point, n, -length / 2)]
}

/**
 * Curl for the pivot symbol: keep heading on from the end of the path, then
 * turn steadily, finishing with an arrowhead on the turn.
 */
function hook(from: Point, dir: Vec): Point[] {
  const radius = 1.6
  const turn = (240 * Math.PI) / 180
  const stepLength = 0.3
  const steps = Math.ceil((radius * turn) / stepLength)
  const out: Point[] = [from]
  let heading = dir
  let p = from
  for (let i = 0; i < steps; i++) {
    p = add(p, heading, stepLength)
    heading = rotate(heading, stepLength / radius)
    out.push(p)
  }
  return out
}

const line = (points: Point[], extra: Partial<Stroke> = {}): Stroke => ({ points, width: INK, ...extra })

/**
 * The strokes that draw one move in International Drill Symbols notation.
 * See PLAN.md, "Symbol set", for what each style means.
 */
export function lineArt(style: MoveStyle, path: readonly Point[]): Stroke[] {
  const points = dedupe(path)
  if (points.length < 2) return []

  const sampler = buildSampler(points)
  const end = sampler.at(sampler.length)
  const head = line(arrowHead(end.point, end.tangent))

  switch (style) {
    case 'skate':
      return [line(points), head]

    case 'backward':
      return [line(wavePoints(points, 2.2, 0.6)), head]

    case 'skate-puck':
      return [line(wavePoints(points, 7, 1.2)), head]

    case 'lateral': {
      // A ladder of ticks across the path, stopping short of the arrowhead.
      const strokes: Stroke[] = [head]
      const spacing = 1.1
      for (let s = spacing / 2; s < sampler.length - 1.2; s += spacing) {
        const { point, tangent } = sampler.at(s)
        strokes.push(line(bar(point, tangent, 1.8), { width: 0.3 }))
      }
      return strokes
    }

    case 'pivot': {
      const curl = hook(end.point, end.tangent)
      const tip = curl[curl.length - 1]
      const heading = unit(curl[curl.length - 2], tip)
      return [line(wavePoints(points, 2.2, 0.6)), line(curl), line(arrowHead(tip, heading, 1.4))]
    }

    case 'pass':
      return [line(points, { dash: '1.6 1.2' }), head]

    case 'shoot':
      // Thick ink with a thinner knockout on top reads as two parallel lines.
      return [
        line(points, { width: 1.4 }),
        line(points, { width: 0.5, knockout: true }),
        line(arrowHead(end.point, end.tangent, 3)),
      ]

    case 'stop':
      return [
        line(points),
        line(bar(end.point, end.tangent, 3.6)),
        line(bar(sampler.at(sampler.length - 1).point, end.tangent, 3.6)),
      ]

    case 'drop-pass': {
      // A puck-carrying wave with a tick where the puck is left behind.
      const mid = sampler.at(sampler.length * 0.55)
      return [line(wavePoints(points, 7, 1.2)), line(bar(mid.point, mid.tangent, 2.6)), head]
    }

    case 'check':
      return [line(points), line(bar(end.point, end.tangent, 3.6))]
  }
}
