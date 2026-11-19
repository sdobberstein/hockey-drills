import { pointAlong } from './geometry'
import { planDrill, type Plan, type PlannedMove, type PlannedStep } from './plan'
import type { Drill, Point } from './types'

/** Every actor's position at one moment, keyed by actor id. */
export type Frame = Record<string, Point>

export interface Timeline {
  /** Total length of the drill in seconds. */
  duration: number
  plan: Plan
  /** Where everything is at time `t` seconds. Clamped to [0, duration]. */
  at(t: number): Frame
}

/**
 * Build a playable timeline. `at(t)` is a pure function of the drill and the
 * time, with no DOM and no hidden state: the player just asks for a frame on
 * each animation tick, and scrubbing is the same call with a different `t`.
 * That is what makes it easy to unit test (PLAN.md, "Data model").
 */
export function buildTimeline(drill: Drill): Timeline {
  return timelineOf(planDrill(drill))
}

/** A timeline over a plan that has already been made, so callers that need both do not plan twice. */
export function timelineOf(plan: Plan): Timeline {
  return {
    duration: plan.duration,
    plan,
    at: (t) => frameAt(plan, t),
  }
}

/** A unit direction: which way something is facing or heading. */
export type Heading = readonly [x: number, y: number]

/** How far each side of a moment to look when working out the way someone is moving, in seconds. */
const HEADING_WINDOW = 0.1

/**
 * Which way an actor is heading at a moment, as a unit vector, or null if they
 * never move.
 *
 * It looks a little either side, so a skater going round a bend turns smoothly
 * instead of snapping. A skater who is standing still keeps the way they were
 * last heading, or if they have not moved yet, the way they are about to: a
 * puck should stay out in front of someone who has stopped, not swing round to
 * some arbitrary side.
 */
export function headingAt(timeline: Timeline, id: string, t: number): Heading | null {
  const direction = (from: number, to: number): Heading | null => {
    const a = timeline.at(from)[id]
    const b = timeline.at(to)[id]
    if (!a || !b) return null
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const d = Math.hypot(dx, dy)
    return d > 1e-4 ? [dx / d, dy / d] : null
  }
  const now = direction(t - HEADING_WINDOW, t + HEADING_WINDOW) ?? direction(t, t + HEADING_WINDOW) ?? direction(t - HEADING_WINDOW, t)
  if (now) return now
  for (let s = t - 2 * HEADING_WINDOW; s >= -1e-9; s -= HEADING_WINDOW) {
    const h = direction(s, s + HEADING_WINDOW)
    if (h) return h
  }
  for (let s = t + HEADING_WINDOW; s <= timeline.duration; s += HEADING_WINDOW) {
    const h = direction(s, s + HEADING_WINDOW)
    if (h) return h
  }
  return null
}

/** The heading of each of these actors at a moment; those who never move are left out. */
export function headingsAt(timeline: Timeline, ids: readonly string[], t: number): Record<string, Heading> {
  const out: Record<string, Heading> = {}
  for (const id of ids) {
    const h = headingAt(timeline, id, t)
    if (h) out[id] = h
  }
  return out
}

function frameAt(plan: Plan, t: number): Frame {
  const time = Math.min(Math.max(t, 0), plan.duration)
  const step = stepAt(plan, time)
  const elapsed = time - step.start

  const moving = new Map<string, PlannedMove>(step.moves.map((m) => [m.actor, m]))
  const frame: Frame = {}
  const pickups = new Map<string, PlannedMove>()
  for (const m of step.moves) if (m.picksUp) pickups.set(m.picksUp, m)

  // Resolve one actor at a time. Carried actors defer to their carrier, which
  // is always a single hop because the validator forbids carrier chains.
  const resolve = (id: string): Point => {
    const cached = frame[id]
    if (cached) return cached

    const move = moving.get(id)
    let position: Point
    if (move) {
      const finished = elapsed >= move.duration
      if (finished && move.receiver) {
        // Arrived with a pass: ride on the receiver from here on.
        position = resolve(move.receiver)
      } else {
        position = finished
          ? move.path[move.path.length - 1]
          : pointAlong(move.path, elapsed * move.speed)
      }
    } else {
      const carrier = step.before.carriers.get(id)
      position = carrier ? resolve(carrier) : step.before.positions.get(id)!
    }
    // A loose puck is collected when a skater's move with `picksUp` ends: until then it sits (or
    // flies) where it is, and from then on it rides that skater. Checked last so it overrides
    // wherever the puck would otherwise have been.
    const picker = pickups.get(id)
    if (picker && elapsed >= picker.duration) position = resolve(picker.actor)
    frame[id] = position
    return position
  }

  for (const id of step.before.positions.keys()) resolve(id)
  return frame
}

/**
 * Index of the step in progress at `time`: the last one that has already
 * started. Used by the player to highlight the current step.
 */
export function stepIndexAt(plan: Plan, time: number): number {
  let found = 0
  plan.steps.forEach((step, i) => {
    if (step.start <= time) found = i
  })
  return found
}

function stepAt(plan: Plan, time: number): PlannedStep {
  return plan.steps[stepIndexAt(plan, time)]
}
