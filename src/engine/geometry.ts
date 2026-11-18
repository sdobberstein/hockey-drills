import type { Point } from './types'

/** Straight-line distance between two points, in feet. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

/** Total length of a polyline (a path made of straight segments). */
export function pathLength(points: readonly Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i])
  return total
}

/**
 * The point `d` feet along a polyline, clamped to its ends.
 *
 * Straight segments only for v1 (PLAN.md, "Deferred"). If we add smoothing
 * later, this and pathLength are the only functions that need to learn about
 * curves; the rest of the engine just asks "where am I after d feet?".
 */
export function pointAlong(points: readonly Point[], d: number): Point {
  if (d <= 0) return points[0]
  let remaining = d
  for (let i = 1; i < points.length; i++) {
    const segment = distance(points[i - 1], points[i])
    if (remaining <= segment) {
      // Zero-length segments are skipped by the `<=` above only when
      // remaining is also 0, so guard the division explicitly.
      const f = segment === 0 ? 0 : remaining / segment
      const [x0, y0] = points[i - 1]
      const [x1, y1] = points[i]
      return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f]
    }
    remaining -= segment
  }
  return points[points.length - 1]
}

export interface Nearest {
  /** Distance from the query point to the closest spot on the path, in feet. */
  distance: number
  /** How far along the path (in feet from its start) that closest spot is. */
  arc: number
}

/**
 * The closest spot on a polyline to `p`, and how far along the path it is.
 *
 * "How far along" is what lets us turn a place into a time: a skater at speed
 * v reaches arc `a` after a / v seconds. The validator uses that to suggest a
 * pass speed that makes the puck arrive just as the receiver gets there.
 */
export function nearestAlongPath(points: readonly Point[], p: Point): Nearest {
  let best: Nearest = { distance: distance(points[0], p), arc: 0 }
  let travelled = 0
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]
    const [bx, by] = points[i]
    const length = distance(points[i - 1], points[i])
    // Project p onto the segment, clamped so we stay on it.
    const f = length === 0 ? 0 : Math.min(1, Math.max(0, ((p[0] - ax) * (bx - ax) + (p[1] - ay) * (by - ay)) / length ** 2))
    const d = Math.hypot(p[0] - (ax + (bx - ax) * f), p[1] - (ay + (by - ay) * f))
    if (d < best.distance) best = { distance: d, arc: travelled + length * f }
    travelled += length
  }
  return best
}
