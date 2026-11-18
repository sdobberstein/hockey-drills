/**
 * TypeScript mirror of schema/drill.schema.json (format version 1).
 *
 * The JSON Schema checks *structure*; these types let the compiler check our
 * code against the same shape. Keep the two in sync by hand until we have a
 * reason to generate one from the other.
 *
 * Coordinates are always full-rink feet: x 0..200 (length), y 0..85 (width).
 * "Half" rink views are crops of this space, never a different system.
 * See PLAN.md, "Data model".
 */

/** [x, y] in feet. */
export type Point = readonly [x: number, y: number]

export type RinkView = 'full' | 'half-right' | 'half-left' | 'half-top' | 'half-bottom'

export type ActorType =
  | 'forward'
  | 'defender'
  | 'goalie'
  | 'coach'
  | 'puck'
  | 'pucks'
  | 'pylon'
  | 'net'

/** Move styles map one-to-one to the International Drill Symbols lines. */
export type MoveStyle =
  | 'skate'
  | 'skate-puck'
  | 'backward'
  | 'lateral'
  | 'pivot'
  | 'pass'
  | 'shoot'
  | 'stop'
  | 'drop-pass'
  | 'check'

export interface Actor {
  id: string
  type: ActorType
  label?: string
  color?: string
  start: Point
  /** Actor id this one follows (typically a puck carried by a player). */
  carriedBy?: string
}

/**
 * One thing an actor does during a step. Exactly one of `points` (follow a
 * path) or `to` (go straight to an actor or a point) is set; the JSON Schema
 * enforces that, so the union below makes the compiler agree.
 */
interface MoveBase {
  actor: string
  style: MoveStyle
  /** Feet per second. Falls back to DEFAULT_SPEEDS[style]. */
  speed?: number
  /** Reserved for curved paths; ignored in v1. */
  smooth?: boolean
}
export interface PathMove extends MoveBase {
  points: Point[]
  to?: never
}
export interface TargetMove extends MoveBase {
  to: string | Point
  points?: never
}
export type Move = PathMove | TargetMove

export interface Step {
  name?: string
  notes?: string
  moves: Move[]
}

export interface Progression {
  series: string
  order: number
}

export interface Drill {
  version: 1
  id: string
  title: string
  description?: string
  tags?: string[]
  rink: RinkView
  progression?: Progression
  actors: Actor[]
  steps: Step[]
}
