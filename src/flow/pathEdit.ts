import { clampToRink } from '../editor/rink'
import { ROUTE_STYLES } from '../editor/routes'
import { pathLength } from '../engine/geometry'
import type { MoveStyle, Point } from '../engine/types'
import { RUN_SPEED_LIMITS, type Starts } from './edit'
import { segmentsFor, type Segment } from './timeline'
import { isAfter, type Flow, type Marker, type Piece, type PuckEvent, type RunPiece } from './types'

/**
 * Editing the shape of a skater's path in a flow: append a run, reshape one,
 * change its style, delete one. Pure functions, like the rest of edit.ts, that
 * return a new flow.
 *
 * Two pieces of bookkeeping run through all of it.
 *
 * First, a path has to stay joined up: each run starts where the one before it
 * (or the skater's start) ended. Reshaping or deleting a run moves where it
 * ends, so reanchorRuns walks the path and makes every run start where the
 * previous one finished.
 *
 * Second, markers are distances along a run. If a run gets longer or shorter, a
 * marker that was 60% of the way along should stay 60% of the way along, or a
 * pass meant to leave "halfway" would suddenly leave somewhere else.
 */

const copy = (p: Point): Point => [p[0], p[1]]

const isRunStyle = (style: MoveStyle) => ROUTE_STYLES.includes(style)

/** A run needs to go somewhere. */
const MIN_RUN_LENGTH = 0.05

const endOf = (s: Segment): number => (s.piece.kind === 'wait' ? s.piece.seconds : s.length)

function withPieces(flow: Flow, actor: string, pieces: Piece[]): Flow {
  return { ...flow, paths: { ...flow.paths, [actor]: pieces } }
}

function mapMarkers(flow: Flow, actor: string, change: (m: Marker) => Marker): Flow {
  const one = (m: Marker): Marker => (m.actor === actor ? change(m) : m)
  const events = flow.events.map((e): PuckEvent => {
    const next: PuckEvent = { ...e, from: isAfter(e.from) ? e.from : one(e.from) }
    if (e.target.kind === 'marker') next.target = { ...e.target, marker: one(e.target.marker) }
    return next
  })
  // A pickup is anchored to a marker as well, so it has to follow the same reshaping.
  const pickups = flow.pickups?.map((u) => ({ ...u, marker: one(u.marker) }))
  return { ...flow, events, ...(pickups ? { pickups } : {}) }
}

/** Where a skater is when their path ends: the end of the last piece, or where they start. */
export function pathEnd(flow: Flow, starts: Starts, actor: string): Point {
  const segments = segmentsFor(flow.paths[actor] ?? [], starts[actor])
  return segments.length > 0 ? segments[segments.length - 1].to : starts[actor]
}

/**
 * Make every run start where the one before it ended (the first, where the
 * skater starts). A flow that is already joined up comes back as the same object.
 */
export function reanchorRuns(flow: Flow, starts: Starts): Flow {
  let changed = false
  const paths: Record<string, Piece[]> = {}
  for (const [actor, pieces] of Object.entries(flow.paths)) {
    let here: Point = starts[actor]
    paths[actor] = pieces.map((piece) => {
      if (piece.kind === 'wait') return piece
      let run = piece
      if (piece.points[0][0] !== here[0] || piece.points[0][1] !== here[1]) {
        changed = true
        run = { ...piece, points: [copy(here), ...piece.points.slice(1)] }
      }
      here = run.points[run.points.length - 1]
      return run
    })
  }
  return changed ? { ...flow, paths } : flow
}

/** Keep markers on one run at the same fraction of the way along it after its length changed. */
function rescaleMarkers(before: Flow, after: Flow, starts: Starts, actor: string, index: number): Flow {
  const oldLength = segmentsFor(before.paths[actor] ?? [], starts[actor])[index]?.length ?? 0
  const newLength = segmentsFor(after.paths[actor] ?? [], starts[actor])[index]?.length ?? 0
  if (!(oldLength > 0) || !(newLength > 0)) return after
  const scale = newLength / oldLength
  return mapMarkers(after, actor, (m) => (m.piece === index ? { ...m, at: m.at * scale } : m))
}

/**
 * Add a run to the end of a skater's path, in a style. It starts where their
 * path already ends (the first point you pass is ignored), so a path can only
 * grow continuously and nobody can be made to jump.
 */
export function appendRun(flow: Flow, starts: Starts, actor: string, style: MoveStyle, points: readonly Point[]): Flow {
  if (!starts[actor] || !isRunStyle(style) || points.length < 2) return flow
  const run: RunPiece = {
    kind: 'run',
    style,
    points: [copy(pathEnd(flow, starts, actor)), ...points.slice(1).map((p) => clampToRink(p))],
  }
  if (pathLength(run.points) < MIN_RUN_LENGTH) return flow
  return withPieces(flow, actor, [...(flow.paths[actor] ?? []), run])
}

/**
 * Reshape a run. Its start stays where the previous piece ended; where it now
 * ends moves the start of the next run too. Markers on it keep their fraction
 * of the way along.
 */
export function setRunPoints(flow: Flow, starts: Starts, actor: string, index: number, points: readonly Point[]): Flow {
  const list = flow.paths[actor]
  const piece = list?.[index]
  if (!list || piece?.kind !== 'run' || points.length < 2) return flow
  const run: RunPiece = { ...piece, points: [copy(piece.points[0]), ...points.slice(1).map((p) => clampToRink(p))] }
  if (pathLength(run.points) < MIN_RUN_LENGTH) return flow
  const next = withPieces(flow, actor, list.map((p, i) => (i === index ? run : p)))
  return reanchorRuns(rescaleMarkers(flow, next, starts, actor, index), starts)
}

export interface RunLook {
  style?: MoveStyle
  /** Feet per second. `null` clears it so the style's default applies. */
  speed?: number | null
  smooth?: boolean
}

/** Change how a run is skated: its style, its speed, or whether its corners are rounded. */
export function setRunLook(flow: Flow, starts: Starts, actor: string, index: number, look: RunLook): Flow {
  const list = flow.paths[actor]
  const piece = list?.[index]
  if (!list || piece?.kind !== 'run') return flow
  if (look.style !== undefined && !isRunStyle(look.style)) return flow
  if (typeof look.speed === 'number' && !(look.speed >= RUN_SPEED_LIMITS.minRunSpeed && look.speed <= RUN_SPEED_LIMITS.maxRunSpeed)) return flow

  const run: RunPiece = { ...piece }
  if (look.style !== undefined) run.style = look.style
  if (look.speed === null) delete run.speed
  else if (look.speed !== undefined) run.speed = look.speed
  if (look.smooth === false) delete run.smooth
  else if (look.smooth) run.smooth = true

  const next = withPieces(flow, actor, list.map((p, i) => (i === index ? run : p)))
  return rescaleMarkers(flow, next, starts, actor, index)
}

/**
 * Delete a run. Whatever was happening during it (a pass leaving, a pass
 * landing) moves to the instant before it, and the run after it is re-joined to
 * where the skater now is. If that leaves two pauses side by side they become
 * one.
 */
export function removeRun(flow: Flow, starts: Starts, actor: string, index: number): Flow {
  const list = flow.paths[actor]
  if (!list || list[index]?.kind !== 'run') return flow
  const earlier = segmentsFor(list, starts[actor])[index - 1]

  let pieces = list.filter((_, i) => i !== index)
  let next = mapMarkers(withPieces(flow, actor, pieces), actor, (m) => {
    if (m.piece > index) return { ...m, piece: m.piece - 1 }
    if (m.piece < index) return m
    return earlier ? { actor, piece: index - 1, at: endOf(earlier) } : { actor, piece: 0, at: 0 }
  })

  const a = pieces[index - 1]
  const b = pieces[index]
  if (a?.kind === 'wait' && b?.kind === 'wait') {
    pieces = [...pieces.slice(0, index - 1), { kind: 'wait', seconds: a.seconds + b.seconds }, ...pieces.slice(index + 1)]
    next = mapMarkers(withPieces(next, actor, pieces), actor, (m) => {
      if (m.piece === index) return { ...m, piece: index - 1, at: m.at + a.seconds }
      return m.piece > index ? { ...m, piece: m.piece - 1 } : m
    })
  }
  return reanchorRuns(next, starts)
}
