import { planDrill, type Plan } from '../engine/plan'
import type { ActorType, Drill, MoveStyle, Point } from '../engine/types'
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

/** A pass, shot or drop pass from release to landing, however many steps it was in the air for. */
export interface Flight {
  puck: string
  style: MoveStyle
  carrier: string
  receiver?: string
  t0: number
  t1: number
  /** The whole route, release to landing. */
  path: Point[]
}

/**
 * Every flight in a plan, with the stretches of a flight that lasts several
 * steps (a release, then `continues` stretches) joined into one.
 */
export function mergedFlights(plan: Plan): Flight[] {
  const out: Flight[] = []
  const open = new Map<string, Flight>()
  for (const step of plan.steps) {
    for (const move of step.moves) {
      if (!move.releases) continue
      if (move.continues) {
        const f = open.get(move.actor)
        if (!f) continue
        f.t1 = step.start + move.duration
        f.receiver = move.receiver
        f.path = [...f.path, ...move.path.slice(1)]
        continue
      }
      const carrier = step.before.carriers.get(move.actor)
      if (!carrier) continue
      const f: Flight = {
        puck: move.actor,
        style: move.style,
        carrier,
        receiver: move.receiver,
        t0: step.start,
        t1: step.start + move.duration,
        path: [...move.path],
      }
      out.push(f)
      open.set(move.actor, f)
    }
  }
  return out
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
  const flights = mergedFlights(plan)

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
    // What happens to this puck, in order: flights, and skaters collecting it when their run ends.
    type Happening = { at: number; flight: Flight } | { at: number; picker: string }
    const happenings: Happening[] = [
      ...flights.filter((x) => x.puck === actor.id).map((flight): Happening => ({ at: flight.t0, flight })),
      ...plan.steps.flatMap((s) =>
        s.moves.filter((m) => m.picksUp === actor.id).map((m): Happening => ({ at: s.start + m.duration, picker: m.actor })),
      ),
    ].sort((a, b) => a.at - b.at)
    for (const h of happenings) {
      if ('flight' in h) {
        const f = h.flight
        if (f.t0 > clock) spans.push({ t0: clock, t1: f.t0, carrier })
        spans.push({ t0: f.t0, t1: f.t1, carrier: null, flight: f.style })
        carrier = f.receiver ?? null
        clock = f.t1
      } else {
        // It lay loose (carrier null) until the skater got there, then it is theirs.
        if (h.at > clock) spans.push({ t0: clock, t1: h.at, carrier })
        carrier = h.picker
        clock = Math.max(clock, h.at)
      }
    }
    // A puck always has at least one span, even in a drill with no moves yet (duration 0), so
    // "who has it" has an answer before anything has happened: that is when you link the first pass.
    // It also has one if the drill ends the instant a pass lands: that skater has the puck, if only at
    // the end, and must be able to pass it on.
    if (plan.duration > clock || spans.length === 0 || carrier !== null) {
      spans.push({ t0: clock, t1: Math.max(plan.duration, clock), carrier })
    }
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

/**
 * How close to a span a moment may be and still count as inside it (seconds). A
 * click on the ice is only accurate to a few hundredths of a foot, so a click
 * meant for the instant a pass lands can come out a couple of milliseconds
 * early, when the puck is still, strictly, in the air.
 */
export const CARRY_SLACK = 0.05

/**
 * Who has a puck at a moment, or null if it is in the air or loose. Used to
 * refuse "F2 passes" at a time F2 does not have the puck, and to say who does.
 */
export function carrierAtTime(model: TimelineModel, puck: string, t: number, slack = CARRY_SLACK): string | null {
  const row = model.pucks.find((p) => p.actor === puck)
  const span = row?.spans.find((s) => s.carrier !== null && t >= s.t0 - slack && t <= s.t1 + slack)
  return span?.carrier ?? null
}

/** The puck a skater is carrying at a moment, if any. */
export function puckCarriedBy(model: TimelineModel, actor: string, t: number, slack = CARRY_SLACK): string | null {
  for (const row of model.pucks) if (carrierAtTime(model, row.actor, t, slack) === actor) return row.actor
  return null
}

/** Said when a drill has no puck at all, which "skate with puck" (only a line style) does not give it. */
export const NO_PUCK_MESSAGE =
  'This drill has no puck yet. “Skate with puck” is only a line style. Add a real puck under “Add to the ice”, then set who carries it.'

/**
 * Why a skater does not have the puck at a moment, in words that say what to do.
 * The reason matters: "nobody has it" is wrong when there is no puck at all, and
 * unhelpful when the puck was simply never given to anyone.
 */
export function whyNoPuck(drill: Drill, model: TimelineModel, actor: string, time: number): string {
  const pucks = drill.actors.filter((a) => a.type === 'puck')
  if (pucks.length === 0) return NO_PUCK_MESSAGE

  const at = `${time.toFixed(2)} s`
  const holder = model.pucks.map((p) => carrierAtTime(model, p.actor, time)).find(Boolean)
  if (holder) return `${actor} does not have the puck at ${at}; ${holder} does.`

  const flying = model.pucks.some((p) => p.spans.some((s) => s.flight && time >= s.t0 && time <= s.t1))
  if (flying) return `The puck is in the air at ${at}: a pass or shot is on its way. Release this one after it lands.`

  const neverCarried = pucks.every((p) => !p.carriedBy) && model.links.length === 0
  if (neverCarried) return `The puck is not being carried by anyone. Select it and set “Carried by” to ${actor}.`

  return `Nobody has the puck at ${at}: it is loose after a pass or shot that nobody received.`
}

/**
 * The first moment a skater has a puck, and which puck: from the start if they begin with
 * it, or the instant a pass reaches them. This is what "click the skater" means when
 * linking a pass, so a skater who has no path (a coach feeding pucks, or F1 passing before
 * anyone has moved) can still be the passer. Null if they never have one.
 */
export function firstPossession(model: TimelineModel, actor: string): { puck: string; time: number } | null {
  let best: { puck: string; time: number } | null = null
  for (const row of model.pucks) {
    for (const span of row.spans) {
      if (span.carrier === actor && (!best || span.t0 < best.time)) best = { puck: row.actor, time: span.t0 }
    }
  }
  return best
}
