import type { Point } from '../engine/types'
import { markerAtTime, endTime, segmentsFor, type Segment } from './timeline'
import { isAfter, type Flow, type Marker, type Piece, type PuckEvent } from './types'

/**
 * Editing a flow: pure functions that return a new flow, never changing the
 * old one (so undo stays a history of drills). Everything here works on times
 * and pieces, which is what a timeline shows; none of it touches the ice.
 *
 * Markers point at a piece and a position in it, so inserting or removing a
 * piece means renumbering the markers that come after it, and moving any that
 * were inside a piece that is gone. That bookkeeping is the main thing these
 * functions do.
 */

/** Where each actor starts: needed to lay out a path in time. */
export type Starts = Readonly<Record<string, Point>>

const bounds = { minRunSpeed: 3, maxRunSpeed: 45 }
export const RUN_SPEED_LIMITS = bounds

/** A wait shorter than this (seconds) is not a wait at all. */
export const MIN_WAIT_SECONDS = 0.05

const round1 = (n: number) => Math.round(n * 10) / 10

/** How far along a piece its end is: feet for a run, seconds for a wait. */
const endOf = (s: Segment): number => (s.piece.kind === 'wait' ? s.piece.seconds : s.length)

function withPieces(flow: Flow, actor: string, pieces: Piece[]): Flow {
  return { ...flow, paths: { ...flow.paths, [actor]: pieces } }
}

/** Apply a change to every marker in the flow that belongs to `actor`. */
function mapMarkers(flow: Flow, actor: string, change: (m: Marker) => Marker): Flow {
  const mapOne = (m: Marker): Marker => (m.actor === actor ? change(m) : m)
  const events = flow.events.map((e): PuckEvent => {
    const next: PuckEvent = { ...e, from: isAfter(e.from) ? e.from : mapOne(e.from) }
    if (e.target.kind === 'marker') next.target = { ...e.target, marker: mapOne(e.target.marker) }
    return next
  })
  return { ...flow, events }
}

/**
 * Remove a stop. Anything that was happening during it (a pass arriving, a
 * pass leaving) moves to the instant the stop began, which is the end of the
 * piece before it. That is what makes a pass that was waiting for a skater who
 * had already finished arrive when they finish.
 */
export function removeWait(flow: Flow, starts: Starts, actor: string, index: number): Flow {
  const list = flow.paths[actor]
  if (!list || list[index]?.kind !== 'wait') return flow
  const segments = segmentsFor(list, starts[actor])
  const earlier = segments[index - 1]
  const next = withPieces(flow, actor, list.filter((_, i) => i !== index))
  return mapMarkers(next, actor, (m) => {
    if (m.piece > index) return { ...m, piece: m.piece - 1 }
    if (m.piece < index) return m
    // The marker was inside the stop that is going away.
    return earlier ? { actor, piece: index - 1, at: endOf(earlier) } : { actor, piece: 0, at: 0 }
  })
}

/** Make a stop last this many seconds; a stop that shrinks to nothing is removed. */
export function setWaitSeconds(flow: Flow, starts: Starts, actor: string, index: number, seconds: number): Flow {
  const list = flow.paths[actor]
  const piece = list?.[index]
  if (!list || piece?.kind !== 'wait') return flow
  if (seconds < MIN_WAIT_SECONDS) return removeWait(flow, starts, actor, index)
  const next = withPieces(flow, actor, list.map((p, i) => (i === index ? { kind: 'wait' as const, seconds } : p)))
  // A marker that was further into the stop than it now lasts stays at its end.
  return mapMarkers(next, actor, (m) => (m.piece === index && m.at > seconds ? { ...m, at: seconds } : m))
}

/**
 * Add a pause before a piece (index 0 delays the start; index = length adds
 * one at the end). Next to an existing pause it lengthens that one instead, so
 * two pauses never sit side by side.
 */
export function insertWait(flow: Flow, actor: string, index: number, seconds: number): Flow {
  if (seconds < MIN_WAIT_SECONDS) return flow
  const list = flow.paths[actor] ?? []
  if (index < 0 || index > list.length) return flow

  const before = list[index - 1]
  const after = list[index]
  const neighbour = before?.kind === 'wait' ? index - 1 : after?.kind === 'wait' ? index : -1
  if (neighbour >= 0) {
    const wait = list[neighbour] as { kind: 'wait'; seconds: number }
    return withPieces(flow, actor, list.map((p, i) => (i === neighbour ? { kind: 'wait' as const, seconds: wait.seconds + seconds } : p)))
  }
  const next = withPieces(flow, actor, [...list.slice(0, index), { kind: 'wait', seconds }, ...list.slice(index)])
  return mapMarkers(next, actor, (m) => (m.piece >= index ? { ...m, piece: m.piece + 1 } : m))
}

/**
 * Make a run last this many seconds, which sets the speed (length / seconds).
 * Markers on a run are distances along it, so they stay where they are on the
 * ice; only when they are reached changes. Returns null if that would need a
 * speed nobody skates.
 */
export function setRunSeconds(flow: Flow, starts: Starts, actor: string, index: number, seconds: number): Flow | null {
  const list = flow.paths[actor]
  const piece = list?.[index]
  if (!list || piece?.kind !== 'run' || !(seconds > 0)) return null
  const length = segmentsFor(list, starts[actor])[index].length
  const speed = round1(length / seconds)
  if (!(speed >= bounds.minRunSpeed && speed <= bounds.maxRunSpeed)) return null
  return withPieces(flow, actor, list.map((p, i) => (i === index ? { ...piece, speed } : p)))
}

/**
 * Who has the puck when this event happens: the skater whose path it leaves
 * from, or for a release taken as the puck arrives, whoever the pass before it
 * landed on.
 */
export function carrierOf(flow: Flow, event: number): string | null {
  const e = flow.events[event]
  if (!e) return null
  if (!isAfter(e.from)) return e.from.actor
  const previous = flow.events[e.from.after]
  if (!previous) return null
  return previous.target.kind === 'marker' ? previous.target.marker.actor : (previous.target.receiver ?? null)
}

/**
 * Move where on the passer's path a pass leaves, to the point they reach at time
 * `t`. A release that was taken as the puck arrived becomes anchored to that
 * point instead: you have chosen when it leaves.
 */
export function moveRelease(flow: Flow, starts: Starts, event: number, t: number): Flow {
  const actor = carrierOf(flow, event)
  if (!actor) return flow
  const segments = segmentsFor(flow.paths[actor] ?? [], starts[actor])
  const marker = markerAtTime(segments, actor, Math.min(Math.max(t, 0), endTime(segments)))
  if (!marker) return flow
  return { ...flow, events: flow.events.map((x, i) => (i === event ? { ...x, from: marker } : x)) }
}

/** Move where on the receiver's path a pass lands, to the point they reach at time `t`. */
export function moveLanding(flow: Flow, starts: Starts, event: number, t: number): Flow {
  const e = flow.events[event]
  if (!e || e.target.kind !== 'marker') return flow
  const actor = e.target.marker.actor
  const segments = segmentsFor(flow.paths[actor] ?? [], starts[actor])
  const marker = markerAtTime(segments, actor, Math.min(Math.max(t, 0), endTime(segments)))
  if (!marker) return flow
  return { ...flow, events: flow.events.map((x, i) => (i === event ? { ...x, target: { ...e.target, marker } } : x)) }
}
