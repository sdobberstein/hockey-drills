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
  const plan = planDrill(drill)
  return {
    duration: plan.duration,
    plan,
    at: (t) => frameAt(plan, t),
  }
}

function frameAt(plan: Plan, t: number): Frame {
  const time = Math.min(Math.max(t, 0), plan.duration)
  const step = stepAt(plan, time)
  const elapsed = time - step.start

  const moving = new Map<string, PlannedMove>(step.moves.map((m) => [m.actor, m]))
  const frame: Frame = {}

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
    frame[id] = position
    return position
  }

  for (const id of step.before.positions.keys()) resolve(id)
  return frame
}

/** The step in progress at `time`: the last one that has already started. */
function stepAt(plan: Plan, time: number): PlannedStep {
  let found = plan.steps[0]
  for (const step of plan.steps) {
    if (step.start <= time) found = step
    else break
  }
  return found
}
