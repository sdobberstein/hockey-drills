import { distance } from '../engine/geometry'
import { planDrill } from '../engine/plan'
import type { Drill, Point } from '../engine/types'
import { endTime, markerAtTime, segmentsFor, TIME_EPS } from './timeline'
import type { After, EventTarget, Flow, Marker, Phase, Piece, PuckEvent, RunPiece } from './types'

const copy = (p: Point): Point => [p[0], p[1]]

/**
 * Recover a flow from a drill made of steps. The inverse of compileFlow.
 *
 * Each actor's routes are joined into one path. Idle time, which the step
 * model leaves as an actor quietly standing while the step runs out, becomes an
 * explicit wait: that is how a drill that stops and starts shows its stops.
 * Each pass, shot or drop pass becomes an event whose markers are the moments
 * the step model implies (when it leaves, and when it lands).
 *
 * Returns null if the drill cannot be planned (broken references), or a
 * release has nobody carrying the puck.
 */
export function drillToFlow(drill: Drill): Flow | null {
  let plan
  try {
    plan = planDrill(drill)
  } catch {
    return null
  }
  // The planner tolerates a move by someone who is not in the drill; a flow cannot.
  const known = new Set(drill.actors.map((a) => a.id))
  if (drill.steps.some((s) => s.moves.some((m) => !known.has(m.actor)))) return null
  const startOf = (id: string): Point => drill.actors.find((a) => a.id === id)!.start

  // 1. Each actor's runs, with a wait wherever they were idle between them.
  const paths: Record<string, Piece[]> = {}
  const clocks = new Map<string, number>()
  plan.steps.forEach((step, si) => {
    step.moves.forEach((planned, mi) => {
      if (planned.releases) return
      const raw = drill.steps[si].moves[mi]
      if (!raw.points) return
      const list = (paths[planned.actor] ??= [])
      const gap = step.start - (clocks.get(planned.actor) ?? 0)
      if (gap > TIME_EPS) addWait(list, gap)
      const run: RunPiece = { kind: 'run', style: raw.style, points: raw.points.map(copy) }
      if (raw.speed !== undefined) run.speed = raw.speed
      if (raw.smooth) run.smooth = true
      list.push(run)
      clocks.set(planned.actor, step.start + planned.duration)
    })
  })
  for (const id of Object.keys(paths)) paths[id] = mergeRuns(paths[id])

  // 2. A marker for an actor at a moment, extending their path with a wait
  //    if they would otherwise have finished by then (they stand there).
  const markerFor = (actor: string, t: number): Marker => {
    const list = (paths[actor] ??= [])
    const end = endTime(segmentsFor(list, startOf(actor)))
    if (t > end + TIME_EPS || list.length === 0) addWait(list, Math.max(t - end, 0))
    return markerAtTime(segmentsFor(list, startOf(actor)), actor, t)!
  }

  // 3. The puck's releases, in the order they happen. A flight that lasts several steps
  //    is written as a release and then `continues` stretches; they are joined back into
  //    one event here.
  const events: PuckEvent[] = []
  // When each puck last landed on someone, to spot a release taken as it arrives.
  const lastLanding = new Map<string, { index: number; time: number; receiver: string }>()
  // A flight still in the air: the event it belongs to, the route so far, and the speed it was given.
  const flying = new Map<string, { index: number; route: Point[]; speed?: number }>()

  /** Set where a flight lands, from the route flown so far and how it ended. */
  const land = (puck: string, planned: { receiver?: string; path: readonly Point[] }, endTime: number) => {
    const flight = flying.get(puck)!
    const event = events[flight.index]
    const via = interior(flight.route)
    let target: EventTarget
    if (planned.receiver) target = { kind: 'marker', marker: markerFor(planned.receiver, endTime) }
    else target = { kind: 'point', at: copy(flight.route[flight.route.length - 1]) }
    if (via.length > 0) target.via = via
    event.target = target
    if (target.kind === 'point' && flight.speed !== undefined) event.speed = flight.speed
    else delete event.speed
    if (planned.receiver) lastLanding.set(puck, { index: flight.index, time: endTime, receiver: planned.receiver })
    else lastLanding.delete(puck)
  }

  let broken = false
  plan.steps.forEach((step, si) => {
    step.moves.forEach((planned, mi) => {
      if (!planned.releases) return
      const raw = drill.steps[si].moves[mi]

      if (planned.continues) {
        const flight = flying.get(planned.actor)
        if (!flight) {
          broken = true // a flight carrying on that never began
          return
        }
        flight.route.push(...planned.path.slice(1).map(copy))
        land(planned.actor, planned, step.start + planned.duration)
        return
      }

      const carrier = step.before.carriers.get(planned.actor)
      if (!carrier) {
        broken = true
        return
      }
      const landed = lastLanding.get(planned.actor)
      const takenOnArrival = landed && landed.receiver === carrier && Math.abs(step.start - landed.time) <= 0.005
      const from: Marker | After = takenOnArrival ? { after: landed.index } : markerFor(carrier, step.start)
      // The target is provisional: a later `continues` stretch may carry the flight further.
      events.push({ puck: planned.actor, style: planned.style, from, target: { kind: 'point', at: copy(planned.path[planned.path.length - 1]) } })
      flying.set(planned.actor, { index: events.length - 1, route: planned.path.map(copy), speed: raw.speed })
      land(planned.actor, planned, step.start + planned.duration)
    })
  })
  // 4. The names and notes a coach gave the steps, kept as phases.
  const phases: Phase[] = []
  plan.steps.forEach((step, si) => {
    const { name, notes } = drill.steps[si]
    if (name || notes) phases.push({ start: step.start, ...(name ? { name } : {}), ...(notes ? { notes } : {}) })
  })

  return broken ? null : { paths, events, ...(phases.length > 0 ? { phases } : {}) }
}

/** Standing still: extend a wait that is already last, so two waits never sit side by side. */
function addWait(list: Piece[], seconds: number): void {
  const last = list[list.length - 1]
  if (last?.kind === 'wait') last.seconds += seconds
  else list.push({ kind: 'wait', seconds })
}

/**
 * Join runs that are the same style and speed and meet end to start, so a run
 * the step model chopped into pieces for sync reasons is one run again. Smooth
 * runs are not joined: smoothing two curves is not the same as smoothing the
 * curve through all their points.
 */
function mergeRuns(pieces: Piece[]): Piece[] {
  const out: Piece[] = []
  for (const piece of pieces) {
    const prev = out[out.length - 1]
    if (
      prev?.kind === 'run' &&
      piece.kind === 'run' &&
      !prev.smooth &&
      !piece.smooth &&
      prev.style === piece.style &&
      prev.speed === piece.speed &&
      distance(prev.points[prev.points.length - 1], piece.points[0]) < 1e-6
    ) {
      prev.points = [...prev.points, ...piece.points.slice(1)]
    } else {
      out.push(piece)
    }
  }
  return out
}

/**
 * The bends in a route: its interior points, except those that lie on a straight
 * line between their neighbours. A flight written across several steps has a
 * point at each step boundary, which is not a bank, so it must not become one.
 */
function interior(route: readonly Point[]): Point[] {
  const bends: Point[] = []
  for (let i = 1; i < route.length - 1; i++) {
    const [a, b, c] = [route[i - 1], route[i], route[i + 1]]
    const length = distance(a, c)
    // Distance of b from the line a-c.
    const off = length === 0 ? distance(a, b) : Math.abs((c[0] - a[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (c[1] - a[1])) / length
    if (off > 1e-4) bends.push(copy(b))
  }
  return bends
}
