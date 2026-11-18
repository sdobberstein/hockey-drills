import { nearestAlongPath } from '../engine/geometry'
import type { MoveStyle, Point } from '../engine/types'
import type { Starts } from './edit'
import { RELEASE_STYLES } from '../editor/releases'
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
