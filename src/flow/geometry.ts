import { distance, pathLength, pointAlong } from '../engine/geometry'
import { smoothPath } from '../engine/geometry'
import type { Point } from '../engine/types'

/**
 * The polyline a run actually follows: the points as given, or the smooth
 * curve through them (the same one the engine draws and times), so lengths and
 * durations here always agree with the engine's.
 */
export function denseOf(points: readonly Point[], smooth: boolean | undefined): Point[] {
  return smooth ? smoothPath(points) : points.map((p) => [p[0], p[1]] as Point)
}

/**
 * The part of a polyline between two arc lengths, as points: an interpolated
 * start, every vertex strictly between, and an interpolated end.
 */
export function cutPolyline(points: readonly Point[], from: number, to: number): Point[] {
  const out: Point[] = [pointAlong(points, from)]
  let travelled = 0
  for (let i = 1; i < points.length; i++) {
    travelled += distance(points[i - 1], points[i])
    if (travelled > from + 1e-9 && travelled < to - 1e-9) out.push([points[i][0], points[i][1]])
  }
  out.push(pointAlong(points, to))
  // Drop repeats so every segment has a direction.
  return out.filter((p, i) => i === 0 || distance(out[i - 1], p) > 1e-9)
}

export const lengthOf = pathLength
