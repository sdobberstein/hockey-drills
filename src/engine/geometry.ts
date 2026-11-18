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

/**
 * A smooth curve through every one of `points`, returned as a dense polyline.
 *
 * Why a polyline and not a curve object: everything downstream (length,
 * "where am I after d feet", line art, the receiver-timing check) already
 * works on polylines. Densifying the curve once, here, means none of that
 * has to learn about curves, and a curved move's length (so its duration)
 * is automatically the length of the curve, not of the chords.
 *
 * It is a centripetal Catmull-Rom spline: it passes exactly through the
 * points the author gave, so they stay meaningful as waypoints, and the
 * "centripetal" parameterisation avoids the loops and overshoots that
 * uneven point spacing causes in the plain version. The two ends are handled
 * by reflecting the neighbouring point, which gives a natural end curve.
 *
 * `resolution` is roughly the spacing between output points, in feet.
 */
export function smoothPath(points: readonly Point[], resolution = 1): Point[] {
  const pts = points.filter((p, i) => i === 0 || distance(points[i - 1], p) > 1e-6)
  if (pts.length < 3) return pts.map((p) => [p[0], p[1]])

  const out: Point[] = [[pts[0][0], pts[0][1]]]
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p0: Point = i === 0 ? [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]] : pts[i - 1]
    const p3: Point = i + 2 < pts.length ? pts[i + 2] : [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]]

    // Centripetal parameterisation: knot gaps are the square root of distance.
    const t0 = 0
    const t1 = t0 + Math.sqrt(distance(p0, p1))
    const t2 = t1 + Math.sqrt(distance(p1, p2))
    const t3 = t2 + Math.sqrt(distance(p2, p3))

    const steps = Math.max(2, Math.ceil(distance(p1, p2) / resolution))
    for (let s = 1; s < steps; s++) {
      const t = t1 + ((t2 - t1) * s) / steps
      // Barry-Goldman: blend the points in three rounds of linear interpolation.
      const a1 = mix(p0, p1, t0, t1, t)
      const a2 = mix(p1, p2, t1, t2, t)
      const a3 = mix(p2, p3, t2, t3, t)
      const b1 = mix(a1, a2, t0, t2, t)
      const b2 = mix(a2, a3, t1, t3, t)
      out.push(mix(b1, b2, t1, t2, t))
    }
    out.push([p2[0], p2[1]]) // land exactly on the author's point
  }
  return out
}

/** Linear interpolation of a and b, where t runs from ta (at a) to tb (at b). */
function mix(a: Point, b: Point, ta: number, tb: number, t: number): Point {
  const f = (t - ta) / (tb - ta)
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
}
