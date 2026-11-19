import { pathLength, smoothPath } from './geometry'
import type { Drill, MoveStyle, Point } from './types'

/**
 * Feet per second, used when a move has no explicit `speed`.
 * Rough, coach-friendly numbers; the point is that drills animate plausibly
 * without every move needing a speed.
 */
export const DEFAULT_SPEEDS: Record<MoveStyle, number> = {
  skate: 25,
  'skate-puck': 22,
  backward: 15,
  lateral: 12,
  pivot: 15,
  pass: 60,
  shoot: 90,
  stop: 10,
  'drop-pass': 40,
  check: 20,
}

/** Styles that let go of a carried puck. */
export const RELEASING_STYLES: ReadonlySet<MoveStyle> = new Set(['pass', 'shoot', 'drop-pass'])

/** Where everyone is, and who is carrying whom, at one instant. */
export interface Snapshot {
  positions: ReadonlyMap<string, Point>
  /** actor id -> id of the actor carrying it. */
  carriers: ReadonlyMap<string, string>
}

export interface PlannedMove {
  actor: string
  style: MoveStyle
  /** Resolved route: a `points` path as written, or [from, target] for `to`. */
  path: readonly Point[]
  speed: number
  /** Seconds. */
  duration: number
  /** True if this move lets go of a carried puck (or, for a continuation, is part of a pass or shot in the air). */
  releases: boolean
  /** The puck was already in the air; this is a later stretch of the same flight. */
  continues?: boolean
  /** Actor that picks the puck up on arrival. */
  receiver?: string
  /** A loose puck this skater takes when the move ends. */
  picksUp?: string
}

export interface PlannedStep {
  /** Carried over from the drill so the UI can label the step. */
  name?: string
  /** Seconds from the start of the drill. */
  start: number
  /** Seconds: the slowest move in the step. */
  duration: number
  moves: readonly PlannedMove[]
  before: Snapshot
  after: Snapshot
}

export interface Plan {
  duration: number
  steps: readonly PlannedStep[]
}

/**
 * Turn a drill into a plan: every move resolved to a path, speed and
 * duration, with the world's state before and after each step.
 *
 * This is where the model's key rule lives (PLAN.md, "Data model"): all moves
 * in a step start together, from the positions at the start of that step, and
 * the step lasts as long as its slowest move. A released puck therefore leaves
 * from where its carrier stood when the step began, while the carrier is free
 * to keep skating. That is what makes a pass fire
 * after the attack finishes, without any hand-tuned delay.
 *
 * Assumes the drill has already passed the structural checks in validate.ts
 * (known actor ids, etc.); it does not re-check them.
 */
export function planDrill(drill: Drill): Plan {
  const { positions, carriers } = initialState(drill)

  const steps: PlannedStep[] = []
  let clock = 0

  for (const step of drill.steps) {
    const before = snapshot(positions, carriers)

    const moves: PlannedMove[] = step.moves.map((move) => {
      const from = before.positions.get(move.actor)!
      // `smooth` rounds a multi-point path into a curve through the same
      // points. Doing it here, once, means the duration (length / speed), the
      // playback position and the drawn line all follow the curve. It only
      // applies to `points` paths; a `to` move is a single straight leg.
      const path: readonly Point[] =
        'points' in move && move.points
          ? move.smooth
            ? smoothPath(move.points)
            : move.points
          : [from, resolveTarget(move.to!, before.positions)]
      const speed = move.speed ?? DEFAULT_SPEEDS[move.style]
      const releases = RELEASING_STYLES.has(move.style)
      return {
        actor: move.actor,
        style: move.style,
        path,
        speed,
        duration: pathLength(path) / speed,
        releases,
        // A pass aimed at an actor hands over to that actor; a banked or
        // lead pass names its receiver explicitly.
        receiver: releases ? (move.receiver ?? (typeof move.to === 'string' ? move.to : undefined)) : undefined,
        ...(move.continues ? { continues: true } : {}),
        ...(move.picksUp ? { picksUp: move.picksUp } : {}),
      }
    })

    // Apply the step's outcome to the running state.
    for (const m of moves) {
      positions.set(m.actor, m.path[m.path.length - 1])
      if (m.releases) carriers.delete(m.actor)
      if (m.receiver) carriers.set(m.actor, m.receiver)
    }
    // A pickup happens when the skater's own move ends, so the puck is theirs for the next
    // step. (Within this step it rides them from that moment; see frameAt in timeline.ts.)
    // It is applied after every release, not in move order: a skater's move can be listed
    // before the puck's pass in the same step, and the pass must not wipe out the pickup.
    for (const m of moves) {
      if (m.picksUp) carriers.set(m.picksUp, m.actor)
    }
    syncCarried(positions, carriers)

    const duration = Math.max(0, ...moves.map((m) => m.duration))
    steps.push({ name: step.name, start: clock, duration, moves, before, after: snapshot(positions, carriers) })
    clock += duration
  }

  return { duration: clock, steps }
}

/**
 * Who is where, and who carries whom, before any step runs.
 *
 * A carried actor ignores its own `start` and sits on its carrier, so the two
 * can never disagree about where the puck is. Exported because an editor needs
 * the opening picture of a drill that may not have any steps yet, which
 * Timeline.at(0) cannot give it.
 */
export function initialState(drill: Drill): { positions: Map<string, Point>; carriers: Map<string, string> } {
  const positions = new Map<string, Point>(drill.actors.map((a) => [a.id, a.start]))
  const carriers = new Map<string, string>()
  for (const actor of drill.actors) {
    if (actor.carriedBy) carriers.set(actor.id, actor.carriedBy)
  }
  syncCarried(positions, carriers)
  return { positions, carriers }
}

function resolveTarget(to: string | Point, positions: ReadonlyMap<string, Point>): Point {
  // An actor target is read at the start of the step, which is why a
  // receiver must not move during the pass (enforced by the validator).
  return typeof to === 'string' ? positions.get(to)! : to
}

function syncCarried(positions: Map<string, Point>, carriers: ReadonlyMap<string, string>): void {
  for (const [carried, carrier] of carriers) positions.set(carried, positions.get(carrier)!)
}

function snapshot(
  positions: ReadonlyMap<string, Point>,
  carriers: ReadonlyMap<string, string>,
): Snapshot {
  return { positions: new Map(positions), carriers: new Map(carriers) }
}
