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
