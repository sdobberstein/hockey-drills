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
  /**
   * Round a `points` path into a smooth curve through the same points.
   * Ignored for `to` moves, which are a single straight leg.
   */
  smooth?: boolean
  /**
   * Actor that picks the puck up when this release (pass, shot, drop-pass)
   * ends. Implied when `to` is an actor id; set it explicitly for a pass that
   * follows a path, such as a bank off the boards.
   */
  receiver?: string
  /**
   * Puck this skater picks up when the move ends. The puck has to be loose by
   * then (a pass or shot that nobody received, or one still lying where it
   * landed) and within reach of where the move ends. This is how a dump-in
   * gets retrieved: the puck sits in the corner, and a skater's run finishes
   * there. Set on the skater's move, not the puck's.
   */
  picksUp?: string
  /**
   * This move carries on a pass or shot that began in an earlier step: the puck
   * is already in the air, and this is the next stretch of the same flight.
   * A step holds all the moves in it, so a flight that lasts longer than one
   * step (because a skater changes style, say, which starts a new step) is
   * written as a chain: the release, then one of these in each following step.
   * `receiver` goes on the last stretch only.
   */
  continues?: boolean
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

/**
 * Where a drill was adapted from, so the original author is credited properly and anyone can
 * go and read the original. Every part but the link is optional.
 */
export interface DrillSource {
  /** The original page. Only http and https links are allowed (see sourceLink in app/source.ts). */
  url: string
  /** The original's own title, when it differs from ours. */
  title?: string
  author?: string
  /** The site or publisher, such as a coaching website. */
  site?: string
}

export interface Drill {
  version: 1
  id: string
  title: string
  description?: string
  tags?: string[]
  rink: RinkView
  progression?: Progression
  source?: DrillSource
  actors: Actor[]
  steps: Step[]
}
