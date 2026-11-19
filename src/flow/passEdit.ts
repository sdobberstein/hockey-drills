import { distance, nearestAlongPath, pathLength, pointAlong } from '../engine/geometry'
import type { MoveStyle, Point } from '../engine/types'
import { nearestBoard } from '../render/rinkGeometry'
import type { Starts } from './edit'
import { MAX_PASS_SPEED, MIN_PASS_SPEED, RELEASE_STYLES } from '../editor/releases'
import { markerTime, segmentsFor } from './timeline'
import { isAfter, type EventTarget, type Flow, type Marker, type PuckEvent, type After } from './types'

/**
 * Adding, changing and removing the puck's passes in a flow. Pure functions
 * that return a new flow, like the rest of edit.ts.
 */

/** A place on a skater's path that a click was near. */
export interface PathHit {
  marker: Marker
  /** When the skater is there. */
  time: number
  /** How far the click was from the path, in feet. */
  distance: number
}

/**
 * The point on a skater's runs closest to a click, as a marker. This is how a
 * click on the ice becomes "when F1 reaches here". Waits have no place on the
 * ice, so only runs can be hit. Null if the skater has no runs.
 */
export function locateOnPath(flow: Flow, starts: Starts, actor: string, click: Point): PathHit | null {
  let best: PathHit | null = null
  for (const seg of segmentsFor(flow.paths[actor] ?? [], starts[actor])) {
    if (seg.piece.kind !== 'run') continue
    const near = nearestAlongPath(seg.geometry, click)
    if (best && near.distance >= best.distance) continue
    const marker: Marker = { actor, piece: seg.index, at: near.arc }
    best = { marker, time: seg.t0 + near.arc / seg.speed, distance: near.distance }
  }
  return best
}

/** The marker at the very end of a skater's path: "where they finish". Null if they have no path. */
export function endMarker(flow: Flow, starts: Starts, actor: string): { marker: Marker; time: number } | null {
  const segments = segmentsFor(flow.paths[actor] ?? [], starts[actor])
  const last = segments[segments.length - 1]
  if (!last) return null
  const at = last.piece.kind === 'wait' ? last.piece.seconds : last.length
  const marker: Marker = { actor, piece: last.index, at }
  return { marker, time: markerTime(segments, marker) }
}

export interface NewPass {
  puck: string
  style: MoveStyle
  from: Marker | After
  target: EventTarget
  /** Feet per second, for a pass to a spot. A pass to a marker has its speed solved. */
  speed?: number
}

/** Add a pass, shot or drop pass. Refused if its style is not a release style. */
export function addPass(flow: Flow, pass: NewPass): Flow {
  if (!RELEASE_STYLES.includes(pass.style)) return flow
  const event: PuckEvent = { puck: pass.puck, style: pass.style, from: pass.from, target: pass.target }
  if (pass.speed !== undefined && pass.target.kind === 'point') event.speed = pass.speed
  return { ...flow, events: [...flow.events, event] }
}

/** The events that are anchored to the landing of event `index`. */
export function followers(flow: Flow, index: number): number[] {
  return flow.events.flatMap((e, i) => (isAfter(e.from) && e.from.after === index ? [i] : []))
}

/**
 * Delete a pass. A shot that was taken as the puck arrived is anchored to this
 * landing, so removing the pass would strand it; that is refused (null) rather
 * than guessing what the shot should become. Later events' chain references are
 * renumbered.
 */
export function removePass(flow: Flow, index: number): Flow | null {
  if (!flow.events[index]) return flow
  if (followers(flow, index).length > 0) return null
  const events = flow.events
    .filter((_, i) => i !== index)
    .map((e): PuckEvent => (isAfter(e.from) && e.from.after > index ? { ...e, from: { ...e.from, after: e.from.after - 1 } } : e))
  return { ...flow, events }
}

export function setPassStyle(flow: Flow, index: number, style: MoveStyle): Flow {
  if (!flow.events[index] || !RELEASE_STYLES.includes(style)) return flow
  return { ...flow, events: flow.events.map((e, i) => (i === index ? { ...e, style } : e)) }
}

/** The speed of a pass to a spot (feet per second); null clears it. Ignored by a pass whose speed is solved. */
export function setPassSpeed(flow: Flow, index: number, speed: number | null): Flow {
  const e = flow.events[index]
  if (!e || (typeof speed === 'number' && !(speed > 0))) return flow
  const next: PuckEvent = { ...e }
  if (speed === null) delete next.speed
  else next.speed = speed
  return { ...flow, events: flow.events.map((x, i) => (i === index ? next : x)) }
}

// --- where could it land? --------------------------------------------------------

/** Where and when a pass leaves, for working out where it could land. */
export interface Release {
  point: Point
  time: number
  /** Bounce points the pass goes through on the way, so its length is the whole route, not the straight line. */
  via?: readonly Point[]
}

export type Believability =
  | { ok: true; speed: number }
  | { ok: false; reason: 'too-soon' | 'too-fast' | 'too-slow'; speed: number | null; seconds: number }

/**
 * Whether a pass from `from` could land at a place and time. It needs the
 * receiver to get there after the pass leaves, and the speed that implies
 * (flight length / flight time) to be one a pass can have.
 */
export function believable(from: Release, point: Point, time: number): Believability {
  const seconds = time - from.time
  if (seconds <= 1e-3) return { ok: false, reason: 'too-soon', speed: null, seconds }
  const speed = pathLength([from.point, ...(from.via ?? []), point]) / seconds
  if (speed > MAX_PASS_SPEED) return { ok: false, reason: 'too-fast', speed, seconds }
  if (speed < MIN_PASS_SPEED) return { ok: false, reason: 'too-slow', speed, seconds }
  return { ok: true, speed }
}

/** A stretch of one run where a pass from `from` could land. */
export interface LandingZone {
  actor: string
  piece: number
  /** Arc length (feet along the run) at the start and end of the stretch. */
  from: number
  to: number
  /** The stretch as points on the ice, for drawing. */
  points: Point[]
}

/** How finely a run is checked, in feet. */
const SAMPLE = 0.5

/**
 * Every stretch of every other skater's path where a pass leaving `from` could
 * land: after it leaves, and at a believable speed. A skater who is waiting has
 * no place on the ice, so only runs count.
 *
 * It samples each run every half foot and joins consecutive believable samples,
 * which is plenty for a path that is tens of feet long and keeps the answer
 * honest: every sample inside a stretch is believable, and none outside is.
 */
export function landingZones(flow: Flow, starts: Starts, from: Release, passer: string): LandingZone[] {
  const zones: LandingZone[] = []
  for (const [actor, pieces] of Object.entries(flow.paths)) {
    if (actor === passer) continue
    for (const seg of segmentsFor(pieces, starts[actor])) {
      if (seg.piece.kind !== 'run' || seg.length <= 0) continue
      const steps = Math.max(1, Math.ceil(seg.length / SAMPLE))
      let open: { from: number; points: Point[] } | null = null
      const close = (to: number) => {
        if (open && open.points.length > 0) zones.push({ actor, piece: seg.index, from: open.from, to, points: open.points })
        open = null
      }
      for (let i = 0; i <= steps; i++) {
        const arc = (seg.length * i) / steps
        const point = pointAlong(seg.geometry, arc)
        if (believable(from, point, seg.t0 + arc / seg.speed).ok) {
          if (!open) open = { from: arc, points: [] }
          open.points.push(point)
        } else close(arc)
      }
      close(seg.length)
    }
  }
  return zones
}

export interface LandingSnap {
  marker: Marker
  point: Point
  /** How far the click was from where it snapped to, in feet. */
  distance: number
}

/** The believable landing nearest a click, if one is within `radius` feet. This is what lets you aim at an area. */
export function snapToLanding(zones: readonly LandingZone[], click: Point, radius: number, only?: string): LandingSnap | null {
  let best: LandingSnap | null = null
  for (const zone of zones) {
    if (only !== undefined && zone.actor !== only) continue
    const steps = zone.points.length - 1
    zone.points.forEach((point, i) => {
      const d = distance(point, click)
      if (d > radius || (best && d >= best.distance)) return
      const arc = steps <= 0 ? zone.from : zone.from + ((zone.to - zone.from) * i) / steps
      best = { marker: { actor: zone.actor, piece: zone.piece, at: arc }, point, distance: d }
    })
  }
  return best
}

/** A sentence for why a landing is not believable, with what would make it so. */
export function explain(b: Extract<Believability, { ok: false }>, receiver: string, passer: string): string {
  switch (b.reason) {
    case 'too-soon':
      return `${receiver} gets there before the pass can leave ${passer}. Pick a spot further along ${receiver}'s path.`
    case 'too-fast':
      return `The pass would need ${Math.round(b.speed ?? 0)} ft/s to reach ${receiver} there in ${b.seconds.toFixed(2)} s. Pick a spot further along their path.`
    case 'too-slow':
      return `The pass would only travel ${Math.round(b.speed ?? 0)} ft/s to reach ${receiver} there, taking ${b.seconds.toFixed(2)} s. Pick a spot earlier on their path.`
  }
}

/** Take the bounces out of a pass: it goes straight from the passer to where it lands. */
export function clearBank(flow: Flow, index: number): Flow {
  const e = flow.events[index]
  if (!e || !e.target.via) return flow
  const { via: _via, ...target } = e.target
  return { ...flow, events: flow.events.map((x, i) => (i === index ? { ...x, target } : x)) }
}

/**
 * Move one bounce of a banked pass. The bounce stays on the boards: wherever it is dragged to, it
 * snaps to the nearest wall, rounded to a tenth of a foot (finer than a hand can place). Nothing
 * else about the pass changes; its speed is solved again from the new route when the flow is compiled.
 */
export function moveBounce(flow: Flow, event: number, index: number, to: Point): Flow {
  const e = flow.events[event]
  if (!e?.target.via?.[index]) return flow
  const board = nearestBoard(to).point
  const bounce: Point = [Math.round(board[0] * 10) / 10, Math.round(board[1] * 10) / 10]
  const via = e.target.via.map((p, i) => (i === index ? bounce : p))
  return { ...flow, events: flow.events.map((x, i) => (i === event ? { ...x, target: { ...e.target, via } } : x)) }
}

/** Remove one bounce of a banked pass. Removing the last one makes it a straight pass. */
export function removeBounce(flow: Flow, event: number, index: number): Flow {
  const e = flow.events[event]
  if (!e?.target.via?.[index]) return flow
  const via = e.target.via.filter((_, i) => i !== index)
  if (via.length === 0) return clearBank(flow, event)
  return { ...flow, events: flow.events.map((x, i) => (i === event ? { ...x, target: { ...e.target, via } } : x)) }
}
