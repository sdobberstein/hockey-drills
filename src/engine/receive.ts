import { distance, pathLength, pointAlong } from './geometry'
import type { Point } from './types'

/**
 * Where should a straight pass land so the puck and a skating receiver arrive
 * together?
 *
 * The puck leaves `release` at `passSpeed`. The receiver follows `route` at
 * `routeSpeed`. For a landing spot at distance `s` along their route:
 *
 *   puck time      = distance(release, spot) / passSpeed
 *   receiver time  = s / routeSpeed
 *
 * and we want those equal. Moving the landing spot changes the puck's flight
 * time, so this cannot be solved by just reading off where the receiver
 * happens to be; we have to find the crossover. The gap
 *
 *   gap(s) = puck time - receiver time
 *
 * starts at or above zero (at s = 0 the puck needs time, the receiver none)
 * and shrinks as `s` grows, so bisection finds where it reaches zero.
 *
 * If the gap is still positive at the end of the route, the puck takes longer
 * than the receiver needs for the whole route; the receiver simply gets there
 * first and waits, so the end of the route is the answer.
 *
 * A receiver with no route is standing still: they are the landing spot.
 */
export function landingSpot(
  release: Point,
  passSpeed: number,
  route: readonly Point[] | undefined,
  routeSpeed: number,
  standing: Point,
): Point {
  if (!route) return standing

  const gap = (s: number) => distance(release, pointAlong(route, s)) / passSpeed - s / routeSpeed
  const end = pathLength(route)
  if (gap(end) >= 0) return route[route.length - 1]

  let lo = 0 // gap(lo) >= 0
  let hi = end // gap(hi) < 0
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    if (gap(mid) >= 0) lo = mid
    else hi = mid
  }
  return pointAlong(route, (lo + hi) / 2)
}
