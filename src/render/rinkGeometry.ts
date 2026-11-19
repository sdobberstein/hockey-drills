import type { RinkView } from '../engine/types'

/**
 * NHL rink dimensions in feet, in the same coordinate space the drills use:
 * x runs 0..200 along the length and y runs 0..85 across the width.
 *
 * SVG's y axis points *down*, and we draw drills in that space unchanged, so
 * y = 0 is the top edge of the picture. Keeping one coordinate system from
 * data to screen means no flipping logic anywhere (PLAN.md, "Data model").
 */
export const RINK = {
  length: 200,
  width: 85,
  cornerRadius: 28,
  goalLineX: 11,
  blueLineX: 75, // the far blue line is at length - blueLineX
  centerX: 100,
  centerY: 42.5,
  faceoffRadius: 15,
  /** End-zone faceoff spots sit 20 ft out from the goal line, 22 ft off centre. */
  endZoneDotX: 31,
  dotOffsetY: 22,
  /** Neutral-zone dots are 5 ft outside each blue line. */
  neutralDotX: 80,
  creaseRadius: 6,
  netWidth: 6,
  netDepth: 4,
} as const

/** Whitespace around the rink in the picture, in feet. */
const MARGIN = 3

/**
 * The SVG viewBox for a rink view. Half views are crops of the full rink, not
 * different drawings, so drill coordinates never change with the view.
 */
export function viewBoxFor(view: RinkView): string {
  const { length, width, centerX, centerY } = RINK
  // Annotated: `as const` above would otherwise narrow these to literal types.
  let x0: number = 0
  let x1: number = length
  let y0: number = 0
  let y1: number = width
  if (view === 'half-left') x1 = centerX
  if (view === 'half-right') x0 = centerX
  if (view === 'half-top') y1 = centerY
  if (view === 'half-bottom') y0 = centerY
  return `${x0 - MARGIN} ${y0 - MARGIN} ${x1 - x0 + 2 * MARGIN} ${y1 - y0 + 2 * MARGIN}`
}

/** Width divided by height of a view, for sizing the picture. */
export function viewAspect(view: RinkView): number {
  const [, , w, h] = viewBoxFor(view).split(' ').map(Number)
  return w / h
}

/**
 * The point on the boards closest to a spot on the ice, and how far away it is.
 *
 * The boards are a rounded rectangle: four straight walls joined by quarter circles of
 * `cornerRadius`. For each wall the closest point is the spot clamped to that wall; for each
 * corner it is the point on the arc in the direction of the spot, which only counts if the spot
 * lies in that corner's quadrant (elsewhere the straight walls are closer or equal). This is
 * what makes a bounce "off the boards" snap onto the wall instead of floating in open ice.
 */
export function nearestBoard(p: readonly [number, number]): { point: [number, number]; distance: number } {
  const { length: L, width: W, cornerRadius: r } = RINK
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  const candidates: [number, number][] = [
    [clamp(p[0], r, L - r), 0], // top wall
    [clamp(p[0], r, L - r), W], // bottom wall
    [0, clamp(p[1], r, W - r)], // left wall
    [L, clamp(p[1], r, W - r)], // right wall
  ]
  for (const [cx, cy] of [[r, r], [L - r, r], [r, W - r], [L - r, W - r]] as const) {
    const dx = p[0] - cx
    const dy = p[1] - cy
    // The corner centre is at (r, r) etc., and its arc is the quadrant facing the corner.
    const facesCorner = (cx < L / 2 ? dx <= 0 : dx >= 0) && (cy < W / 2 ? dy <= 0 : dy >= 0)
    const d = Math.hypot(dx, dy)
    if (facesCorner && d > 1e-9) candidates.push([cx + (dx / d) * r, cy + (dy / d) * r])
  }
  let best = candidates[0]
  for (const c of candidates) if (Math.hypot(c[0] - p[0], c[1] - p[1]) < Math.hypot(best[0] - p[0], best[1] - p[1])) best = c
  return { point: best, distance: Math.hypot(best[0] - p[0], best[1] - p[1]) }
}
