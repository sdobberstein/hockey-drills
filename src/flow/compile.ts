import { pathLength } from '../engine/geometry'
import { DEFAULT_SPEEDS } from '../engine/plan'
import type { Drill, Move, Point, Step } from '../engine/types'
import { validateDrill } from '../engine/validate'
import { MAX_PASS_SPEED, MIN_PASS_SPEED } from '../editor/releases'
import { cutPolyline } from './geometry'
import { markerPoint, markerTime, positionAtTime, segmentsFor, type Segment } from './timeline'
import { isAfter, type Flow, type PuckEvent, type RunPiece } from './types'

export interface FlowProblem {
  code:
    | 'receiver-before-release'
    | 'pass-speed'
    | 'pass-in-flight'
    | 'nobody-moves'
    | 'unknown-actor'
    | 'bad-chain'
    | 'drill-invalid'
  message: string
  /** Seconds into the drill, when the problem has a moment. */
  time?: number
}

export interface Compiled {
  drill: Drill
  problems: FlowProblem[]
}

/** Boundaries closer than this (seconds) are one boundary. */
const MERGE = 0.005

const round1 = (n: number) => Math.round(n * 10) / 10
const copy = (p: Point): Point => [p[0], p[1]]

interface Resolved {
  /** Who has the puck when it leaves. */
  carrier: string
  event: PuckEvent
  /** When the puck leaves, and where from. */
  tRel: number
  /** When it lands. */
  tLand: number
  /** The path it follows, release to landing. */
  route: Point[]
  speed: number
  receiver?: string
}

/**
 * Turn a flow into the steps of a drill (the inverse of drillToFlow).
 *
 * Step boundaries fall at every release, at every piece boundary of every
 * actor, and at the end. Every actor's path is cut at those same instants, so
 * every move in a step lasts exactly as long as the step: nobody can finish
 * early by accident, which is the point of authoring this way. The drill's
 * actors, rink and details are kept; its steps are replaced.
 */
export function compileFlow(drill: Drill, flow: Flow): Compiled {
  const problems: FlowProblem[] = []
  const segs = new Map<string, Segment[]>()
  const starts = new Map<string, Point>()
  for (const a of drill.actors) {
    starts.set(a.id, a.start)
    segs.set(a.id, segmentsFor(flow.paths[a.id] ?? [], a.start))
  }

  // --- resolve each release: when it leaves, where it goes, how fast -------
  // In order, because a release taken as the puck arrives depends on the landing before it.
  const resolved: Resolved[] = []
  const byIndex: (Resolved | undefined)[] = []
  const add = (index: number, r: Resolved) => {
    resolved.push(r)
    byIndex[index] = r
  }
  flow.events.forEach((event, index) => {
    // When and where it leaves, and who is carrying it.
    let carrierActor: string
    let tRel: number
    let rel: Point
    if (isAfter(event.from)) {
      const previous = byIndex[event.from.after]
      if (!previous?.receiver || !segs.has(previous.receiver)) {
        problems.push({
          code: 'bad-chain',
          message: `A ${event.style} is meant to leave as the pass before it arrives, but that pass has no receiver or could not be placed.`,
        })
        return
      }
      carrierActor = previous.receiver
      tRel = previous.tLand + (event.from.delay ?? 0)
      rel = positionAtTime(segs.get(carrierActor)!, starts.get(carrierActor)!, tRel)
    } else {
      const carrier = segs.get(event.from.actor)
      if (!carrier) {
        problems.push({ code: 'unknown-actor', message: `A ${event.style} leaves from "${event.from.actor}", who is not in the drill.` })
        return
      }
      carrierActor = event.from.actor
      tRel = markerTime(carrier, event.from)
      rel = markerPoint(carrier, event.from, starts.get(carrierActor)!)
    }
    const via = event.target.via ?? []

    if (event.target.kind === 'marker') {
      const marker = event.target.marker
      const receiver = segs.get(marker.actor)
      if (!receiver) {
        problems.push({ code: 'unknown-actor', message: `A ${event.style} lands on "${marker.actor}", who is not in the drill.` })
        return
      }
      const tLand = markerTime(receiver, marker)
      const route = [rel, ...via.map(copy), markerPoint(receiver, marker, starts.get(marker.actor)!)]
      const length = pathLength(route)
      if (tLand - tRel <= 1e-3) {
        problems.push({
          code: 'receiver-before-release',
          time: tRel,
          message: `The ${event.style} leaves ${carrierActor} at ${tRel.toFixed(2)} s, but ${marker.actor} reaches the landing point at ${tLand.toFixed(2)} s. Land it later on ${marker.actor}'s path.`,
        })
        const speed = DEFAULT_SPEEDS[event.style]
        add(index, { carrier: carrierActor, event, tRel, tLand: tRel + length / speed, route, speed, receiver: marker.actor })
        return
      }
      const speed = Math.max(round1(length / (tLand - tRel)), 0.1)
      if (speed < MIN_PASS_SPEED || speed > MAX_PASS_SPEED) {
        problems.push({
          code: 'pass-speed',
          time: tRel,
          message: `Getting the ${event.style} from ${carrierActor} to ${marker.actor} in ${(tLand - tRel).toFixed(2)} s needs ${speed} ft/s. Move the landing point to make it believable.`,
        })
      }
      add(index, { carrier: carrierActor, event, tRel, tLand, route, speed, receiver: marker.actor })
    } else {
      const route = [rel, ...via.map(copy), copy(event.target.at)]
      const speed = event.speed ?? DEFAULT_SPEEDS[event.style]
      add(index, { carrier: carrierActor, event, tRel, tLand: tRel + pathLength(route) / speed, route, speed, receiver: event.target.receiver })
    }
  })

  // --- step boundaries ---------------------------------------------------------
  // Each boundary notes whether something *starts* there (a run, or a release),
  // because that matters for a flight in the air (below).
  const marks: { t: number; starts: boolean }[] = [{ t: 0, starts: false }]
  let end = 0
  for (const list of segs.values()) {
    for (const s of list) {
      marks.push({ t: s.t0, starts: s.piece.kind === 'run' }, { t: s.t1, starts: false })
      end = Math.max(end, s.t1)
    }
  }
  for (const r of resolved) {
    marks.push({ t: r.tRel, starts: true })
    end = Math.max(end, r.tLand)
  }
  // A phase starts a step of its own, so that the name has a step to go on.
  for (const phase of flow.phases ?? []) {
    if (phase.start >= 0 && phase.start < end) marks.push({ t: phase.start, starts: true })
  }
  marks.push({ t: end, starts: false })

  const merged = [...marks]
    .sort((x, y) => x.t - y.t)
    .reduce<{ t: number; starts: boolean }[]>((out, m) => {
      const last = out[out.length - 1]
      if (last && m.t - last.t <= MERGE) last.starts ||= m.starts
      else out.push({ ...m })
      return out
    }, [])

  // A step holds a whole flight, so the pass spans every instant between its
  // release and its landing. A skater whose run merely *ends* in that window
  // just stands for the rest of the step, so that boundary can go. Something
  // that *starts* in it (a new run, another release) would need a step of its
  // own in the middle of the flight, which cannot be represented.
  const dropped = new Set<number>()
  for (const r of resolved) {
    for (const m of merged) {
      if (m.t <= r.tRel + MERGE || m.t >= r.tLand - MERGE) continue
      if (m.starts) {
        problems.push({
          code: 'pass-in-flight',
          time: m.t,
          message: `Something starts at ${m.t.toFixed(2)} s while the ${r.event.style} from ${r.carrier} is in the air (${r.tRel.toFixed(2)} to ${r.tLand.toFixed(2)} s), which steps cannot represent. Move it until after the ${r.event.style} lands.`,
        })
      } else dropped.add(m.t)
    }
  }
  const kept = merged.filter((m) => !dropped.has(m.t))

  // Fewer, tidier steps: a boundary where nothing starts (a run merely ends) is
  // needless if one move still spans the whole stretch around it, because the
  // step then lasts exactly as long as that move. Merge such stretches. This
  // never changes timing; it only avoids steps that say nothing new.
  const spanned = (a: number, c: number) =>
    [...segs.values()].some((list) => list.some((s) => s.piece.kind === 'run' && s.t0 <= a + MERGE && s.t1 >= c - MERGE)) ||
    resolved.some((r) => r.tRel <= a + MERGE && r.tLand >= c - MERGE)
  for (let again = true; again; ) {
    again = false
    for (let i = 1; i < kept.length - 1; i++) {
      if (kept[i].starts || !spanned(kept[i - 1].t, kept[i + 1].t)) continue
      kept.splice(i, 1)
      again = true
      break
    }
  }
  const boundaries = kept.map((m) => m.t)


  // --- cut every path at the boundaries ---------------------------------------
  const steps: Step[] = []
  for (let k = 0; k + 1 < boundaries.length; k++) {
    const a = boundaries[k]
    const c = boundaries[k + 1]
    const moves: Move[] = []

    for (const actor of drill.actors) {
      let best: Segment | null = null
      let most = 0
      for (const s of segs.get(actor.id) ?? []) {
        if (s.piece.kind !== 'run') continue
        const overlap = Math.min(c, s.t1) - Math.max(a, s.t0)
        if (overlap > most) {
          best = s
          most = overlap
        }
      }
      if (best && most > 1e-4) {
        const move = emitRun(actor.id, best, Math.max(a, best.t0), Math.min(c, best.t1))
        if (move) moves.push(move)
      }
    }

    let name: string | undefined
    for (const r of resolved) {
      if (Math.abs(r.tRel - a) > MERGE) continue
      moves.push(emitRelease(r))
      name ??= r.event.name
    }
    // A phase that starts here names the step (and wins over an event's own name).
    const phase = (flow.phases ?? []).find((p) => Math.abs(p.start - a) <= MERGE)
    if (phase?.name) name = phase.name

    if (moves.length === 0) {
      problems.push({ code: 'nobody-moves', time: a, message: `Nobody moves from ${a.toFixed(2)} s to ${c.toFixed(2)} s, so there is no step for it; that time is removed.` })
      continue
    }
    const step: Step = { moves }
    if (name) step.name = name
    if (phase?.notes) step.notes = phase.notes
    steps.push(step)
  }

  const result: Drill = { ...drill, steps }
  for (const issue of validateDrill(result)) {
    problems.push({ code: 'drill-invalid', message: `${issue.location}: ${issue.message}` })
  }
  return { drill: result, problems }
}

/**
 * The move for part of a run, between two times. A whole smooth run keeps its
 * own points and the smooth flag. A smooth run cut part-way is emitted as the
 * dense points of the curve, so the geometry is exact and the pieces join up.
 */
function emitRun(actor: string, seg: Segment, tA: number, tB: number): Move | null {
  const piece = seg.piece as RunPiece
  const s0 = Math.max((tA - seg.t0) * seg.speed, 0)
  const s1 = Math.min((tB - seg.t0) * seg.speed, seg.length)
  if (s1 - s0 < 1e-6) return null

  const whole = s0 <= 1e-3 && s1 >= seg.length - 1e-3
  let points: Point[]
  let smooth = false
  if (whole) {
    points = piece.points.map(copy)
    smooth = piece.smooth === true
  } else {
    points = cutPolyline(seg.geometry, s0, s1)
  }
  if (points.length < 2) return null

  const move: Move = { actor, style: piece.style, points }
  if (smooth) move.smooth = true
  // The nominal speed is exact by construction; leave it out when it is the style's default.
  if (Math.abs(seg.speed - DEFAULT_SPEEDS[piece.style]) >= 0.05) move.speed = seg.speed
  return move
}

function emitRelease(r: Resolved): Move {
  const { event, route, speed, receiver } = r
  const move: Move =
    route.length > 2
      ? { actor: event.puck, style: event.style, points: route.map(copy) }
      : { actor: event.puck, style: event.style, to: copy(route[1]) }
  if (Math.abs(speed - DEFAULT_SPEEDS[event.style]) >= 0.05) move.speed = speed
  if (receiver !== undefined) move.receiver = receiver
  return move
}
