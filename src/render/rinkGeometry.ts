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
