import type { MoveStyle, Point } from '../engine/types'

/**
 * The flow model: an authoring layer over a drill (see PLAN.md, "The continuous
 * (flow) view"). The drill file on disk is unchanged; a flow is compiled to
 * steps (compile.ts) and can be recovered from steps (import.ts).
 */

/** The skater moves along `points` in a style, at a speed (the style's default if omitted). */
export interface RunPiece {
  kind: 'run'
  style: MoveStyle
  speed?: number
  smooth?: boolean
  /** The first point is where the previous piece ended (or the actor's start). */
  points: Point[]
}

/** The skater stands still, on purpose, for this many seconds. */
export interface WaitPiece {
  kind: 'wait'
  seconds: number
}

export type Piece = RunPiece | WaitPiece

/**
 * A place and moment on one actor's own timeline: a piece, and how far into it.
 * `at` is feet along a run, or seconds into a wait. Anchoring to a position in
 * a piece (not an absolute time) keeps a pass attached to "when F1 reaches
 * here" when earlier parts of the path are reshaped.
 */
export interface Marker {
  actor: string
  piece: number
  at: number
}

/** Where a pass, shot or drop pass ends up. */
export type EventTarget =
  /** At a marker on a receiver's path. The pass speed is solved from the two times. */
  | { kind: 'marker'; marker: Marker; via?: Point[] }
  /** At a spot on the ice. The speed is given (or the style's default). */
  | { kind: 'point'; at: Point; receiver?: string; via?: Point[] }

/**
 * A release taken as the puck arrives: it leaves the moment the previous pass
 * lands on the carrier, after an optional hold. This is how a shot or a
 * one-touch pass is anchored, so that moving the pass that fed it moves the
 * shot with it, instead of leaving it behind in the air.
 */
export interface After {
  /** The index of the event whose landing this one follows. */
  after: number
  /** Seconds the carrier holds it before releasing. */
  delay?: number
}

export const isAfter = (from: Marker | After): from is After => 'after' in from

export interface PuckEvent {
  puck: string
  style: MoveStyle
  /** When and where the puck leaves: a point on the carrier's path, or the instant the previous pass lands. */
  from: Marker | After
  target: EventTarget
  /** Feet per second; used for a spot target, ignored when the speed is solved. */
  speed?: number
  /** Names the step that starts when the puck leaves. */
  name?: string
}

/**
 * A named stretch of the drill, such as "Cross on the boards". It marks where
 * the stretch begins; it lasts until the next one. These carry the step names
 * and notes a coach wrote, so they survive turning a drill into a flow and
 * back. They are labels: a phase starts a new step, but changes nothing about
 * how anyone moves.
 *
 * The start is in seconds for now. When flows become editable, phases will
 * need to be anchored to something that moves with the edit.
 */
export interface Phase {
  /** Seconds from the start of the drill. */
  start: number
  name?: string
  notes?: string
}

/**
 * A skater taking a loose puck: "F2 picks up the puck when they reach here". The skater is
 * `marker.actor` and the marker is the end of the run that collects it, so a pickup moves
 * with that run the same way a pass does. The puck must be lying loose by then (a pass or
 * shot that nobody received, or one that has not moved) and close enough to reach.
 */
export interface Pickup {
  puck: string
  marker: Marker
}

export interface Flow {
  /** Each actor's path. An actor with no entry stands still for the whole drill. */
  paths: Record<string, Piece[]>
  events: PuckEvent[]
  /** Loose pucks skaters collect, in any order. */
  pickups?: Pickup[]
  /** Named stretches, in order of start. */
  phases?: Phase[]
}
