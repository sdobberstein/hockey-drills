import type { Point } from '../engine/types'

const RINK_LENGTH = 200
const RINK_WIDTH = 85

/** Keep a point on the ice, rounded to a tenth of a foot (finer than anyone can place by hand). */
export function clampToRink(p: Point): Point {
  const x = Math.min(RINK_LENGTH, Math.max(0, p[0]))
  const y = Math.min(RINK_WIDTH, Math.max(0, p[1]))
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10]
}
