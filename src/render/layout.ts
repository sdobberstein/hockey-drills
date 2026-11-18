import type { Frame } from '../engine/timeline'
import type { Actor, Point } from '../engine/types'

/**
 * Where to draw the puck, in feet. A carried puck has exactly its carrier's
 * position in the engine (so they can never drift apart), which would hide it
 * under the player's symbol. For drawing only, we nudge it beside the player.
 *
 * Detecting "sitting on another actor" from the frame, rather than asking
 * the engine who carries it, keeps this purely a display concern and covers
 * a puck that has just arrived with a pass too.
 */
export const CARRY_OFFSET: Point = [3, 1.8]
const SAME_SPOT = 0.05

export function displayPosition(actor: Actor, frame: Frame, actors: readonly Actor[]): Point {
  const at = frame[actor.id] ?? actor.start
  if (actor.type !== 'puck') return at

  const carried = actors.some((other) => {
    if (other.id === actor.id || other.type === 'puck') return false
    const p = frame[other.id] ?? other.start
    return Math.hypot(p[0] - at[0], p[1] - at[1]) < SAME_SPOT
  })
  return carried ? [at[0] + CARRY_OFFSET[0], at[1] + CARRY_OFFSET[1]] : at
}
