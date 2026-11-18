import type { Frame, Heading } from '../engine/timeline'
import type { Actor, Point } from '../engine/types'

/**
 * Where to draw the puck, in feet. A carried puck has exactly its carrier's
 * position in the engine (so they can never drift apart), which would hide it
 * under the player's symbol. For drawing only, we move it out in front of the
 * player, in the direction they are heading, about a stick's length away.
 *
 * Detecting "sitting on another actor" from the frame, rather than asking the
 * engine who carries it, keeps this purely a display concern and covers a puck
 * that has just arrived with a pass too.
 */
export const CARRY_DISTANCE = 3.4

/**
 * Where the puck goes when we do not know which way the carrier is heading (a
 * drill where they never move): beside them, as it used to be drawn.
 */
export const CARRY_OFFSET: Point = [3, 1.8]
const SAME_SPOT = 0.05

export function displayPosition(
  actor: Actor,
  frame: Frame,
  actors: readonly Actor[],
  headings?: Readonly<Record<string, Heading>>,
): Point {
  const at = frame[actor.id] ?? actor.start
  if (actor.type !== 'puck') return at

  const carrier = actors.find((other) => {
    if (other.id === actor.id || other.type === 'puck') return false
    const p = frame[other.id] ?? other.start
    return Math.hypot(p[0] - at[0], p[1] - at[1]) < SAME_SPOT
  })
  if (!carrier) return at
  const heading = headings?.[carrier.id]
  return heading
    ? [at[0] + heading[0] * CARRY_DISTANCE, at[1] + heading[1] * CARRY_DISTANCE]
    : [at[0] + CARRY_OFFSET[0], at[1] + CARRY_OFFSET[1]]
}
