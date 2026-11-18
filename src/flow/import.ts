import { distance } from '../engine/geometry'
import { planDrill } from '../engine/plan'
import type { Drill, Point } from '../engine/types'
import { endTime, markerAtTime, segmentsFor, TIME_EPS } from './timeline'
import type { EventTarget, Flow, Marker, Piece, PuckEvent, RunPiece } from './types'

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

  // 3. The puck's releases, in the order they happen.
  const events: PuckEvent[] = []
  let broken = false
  plan.steps.forEach((step, si) => {
    step.moves.forEach((planned, mi) => {
      if (!planned.releases) return
      const raw = drill.steps[si].moves[mi]
      const carrier = step.before.carriers.get(planned.actor)
      if (!carrier) {
        broken = true
        return
      }
      const from = markerFor(carrier, step.start)
      const via = raw.points && raw.points.length > 2 ? raw.points.slice(1, -1).map(copy) : undefined

      let target: EventTarget
      if (planned.receiver) {
        target = { kind: 'marker', marker: markerFor(planned.receiver, step.start + planned.duration) }
        if (via) target.via = via
      } else {
        target = { kind: 'point', at: copy(planned.path[planned.path.length - 1]) }
        if (via) target.via = via
      }
      const event: PuckEvent = { puck: planned.actor, style: planned.style, from, target }
      if (raw.speed !== undefined && target.kind === 'point') event.speed = raw.speed
      const name = drill.steps[si].name
      if (name) event.name = name
      events.push(event)
    })
  })
  return broken ? null : { paths, events }
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
