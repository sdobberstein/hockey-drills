import { planDrill } from '../engine/plan'
import type { ActorType, Drill, MoveStyle } from '../engine/types'
import { drillToFlow } from './import'
import { segmentsFor } from './timeline'

/**
 * Everything the timeline view draws, worked out from a drill. Pure data, so
 * the view itself only has to lay it out and the rules (what counts as a
 * stop?) can be tested.
 */

/**
 * What a stretch of standing still means:
 * - `stop`: they stood still between two runs, or while a pass was arriving.
 *   This is the thing the view exists to show.
 * - `delay`: they have not started yet (a deliberate late start, like a
 *   backdoor run timed to arrive later).
 * - `rest`: they have finished and are standing for the rest of the drill.
 */
export type WaitRole = 'stop' | 'delay' | 'rest'

export interface TimelinePiece {
  t0: number
  t1: number
  kind: 'run' | 'wait'
  style?: MoveStyle
  role?: WaitRole
}

export interface TimelineRow {
  actor: string
  label: string
  type: ActorType
  pieces: TimelinePiece[]
}

/** The puck over time: carried by someone, in the air, or loose. */
export interface PuckSpan {
  t0: number
  t1: number
  /** Who carries it; null when it is in the air or loose. */
  carrier: string | null
  /** The pass, shot or drop pass in progress, when it is in the air. */
  flight?: MoveStyle
}

export interface PuckRow {
  actor: string
  label: string
  spans: PuckSpan[]
}

/** A pass joining two rows: it leaves one skater at `from` and reaches another at `to`. */
export interface TimelineLink {
  style: MoveStyle
  from: { actor: string; t: number }
  to: { actor: string | null; t: number }
  /**
   * It leaves the moment the previous pass lands on this carrier (a shot taken
   * as the puck is received), so it moves with that landing and has no end of
   * its own to drag. Drawing one would sit exactly on top of the landing.
   */
  chained: boolean
}

export interface TimelineModel {
  duration: number
  rows: TimelineRow[]
  pucks: PuckRow[]
  links: TimelineLink[]
  /** Where each step of the drill begins. */
  steps: { start: number; name?: string }[]
}

export function buildTimelineModel(drill: Drill): TimelineModel | null {
  const flow = drillToFlow(drill)
  if (!flow) return null
  let plan
  try {
    plan = planDrill(drill)
  } catch {
    return null
  }

  // Events by when they happen, from the plan: exact, and the same times the engine plays.
  const flights: { puck: string; style: MoveStyle; carrier: string; receiver?: string; t0: number; t1: number }[] = []
  for (const step of plan.steps) {
    for (const move of step.moves) {
      const carrier = step.before.carriers.get(move.actor)
      if (move.releases && carrier) {
        flights.push({ puck: move.actor, style: move.style, carrier, receiver: move.receiver, t0: step.start, t1: step.start + move.duration })
      }
    }
  }

  const rows: TimelineRow[] = []
  for (const actor of drill.actors) {
    const pieces = flow.paths[actor.id]
    if (!pieces || actor.type === 'puck') continue
    const segments = segmentsFor(pieces, actor.start)
    const lastRun = segments.reduce((last, s, i) => (s.piece.kind === 'run' ? i : last), -1)
    const arrivals = flights.filter((f) => f.receiver === actor.id).map((f) => f.t1)

    rows.push({
      actor: actor.id,
      label: actor.label ?? actor.id,
      type: actor.type,
      pieces: segments.map((s, i): TimelinePiece => {
        if (s.piece.kind === 'run') return { t0: s.t0, t1: s.t1, kind: 'run', style: s.piece.style }
        // A wait is a stop if a run follows it, or a pass is arriving while they stand.
        const passArrives = arrivals.some((t) => t > s.t0 - 1e-6 && t <= s.t1 + 1e-6)
        const role: WaitRole = i === 0 && lastRun > i ? 'delay' : lastRun > i || passArrives ? 'stop' : 'rest'
        return { t0: s.t0, t1: s.t1, kind: 'wait', role }
      }),
    })
  }

  const pucks: PuckRow[] = []
  for (const actor of drill.actors) {
    if (actor.type !== 'puck') continue
    const spans: PuckSpan[] = []
    let carrier: string | null = actor.carriedBy ?? null
    let clock = 0
    for (const f of flights.filter((x) => x.puck === actor.id).sort((a, b) => a.t0 - b.t0)) {
      if (f.t0 > clock) spans.push({ t0: clock, t1: f.t0, carrier })
      spans.push({ t0: f.t0, t1: f.t1, carrier: null, flight: f.style })
      carrier = f.receiver ?? null
      clock = f.t1
    }
    if (plan.duration > clock) spans.push({ t0: clock, t1: plan.duration, carrier })
    pucks.push({ actor: actor.id, label: actor.label ?? actor.id, spans })
  }

  return {
    duration: plan.duration,
    rows,
    pucks,
    links: flights.map((f, i) => ({
      style: f.style,
      from: { actor: f.carrier, t: f.t0 },
      to: { actor: f.receiver ?? null, t: f.t1 },
      chained: flights.some((g, j) => j < i && g.puck === f.puck && g.receiver === f.carrier && Math.abs(g.t1 - f.t0) <= 0.005),
    })),
    steps: plan.steps.map((s, i) => ({ start: s.start, ...(drill.steps[i].name ? { name: drill.steps[i].name } : {}) })),
  }
}

