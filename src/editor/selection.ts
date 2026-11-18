import type { Point } from '../engine/types'

/**
 * What is selected in the editor: an actor, one actor's route in a step, or a
 * block on the timeline (a run or a wait, by actor and position in their path).
 */
export type Selection =
  | { kind: 'actor'; id: string }
  | { kind: 'route'; step: number; actor: string }
  | { kind: 'piece'; actor: string; piece: number }
  /** A pass, shot or drop pass in the flow view, by its number in the order they happen. */
  | { kind: 'pass'; link: number }
  | null

/** A route being drawn, one click at a time. The first point is where the actor stands. */
export interface Drawing {
  actor: string
  points: Point[]
}

/**
 * Two clicks closer than this (feet) are one point, which is what a double-click
 * produces. The pointer moves a few pixels between the two presses, which is
 * several tenths of a foot at the zoom the ice is usually shown at, and a final
 * segment that short is just a hook in the line (the arrowhead and a pivot's curl
 * both draw badly on it), so be generous.
 */
export const SAME_POINT = 1

/**
 * Close off a route being drawn. A double-click sends a click for each press
 * before it finishes, so drop a repeated final point. Returns null if fewer
 * than two distinct points were drawn (nothing worth keeping).
 */
export function finishDrawing(drawing: Drawing): Point[] | null {
  const points = drawing.points.filter(
    (p, i) => i === 0 || Math.hypot(p[0] - drawing.points[i - 1][0], p[1] - drawing.points[i - 1][1]) > SAME_POINT,
  )
  return points.length >= 2 ? points : null
}
