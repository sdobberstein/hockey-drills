import { distance } from '../engine/geometry'
import { planDrill, RELEASING_STYLES } from '../engine/plan'
import type { Drill, Move, MoveStyle, PathMove, Point, Step } from '../engine/types'
import { clampToRink } from './rink'

/**
 * Editing steps and routes. Like ops.ts these are pure functions that return a
 * new drill, which keeps undo a plain history of drills.
 *
 * A "route" is a move that follows `points`. Release moves (pass, shot) are a
 * different kind of edit and live elsewhere. A route is identified by its
 * step and actor, because an actor can have only one move per step.
 */

/** Line styles you can draw as a route: everything except the puck releases. */
export const ROUTE_STYLES: readonly MoveStyle[] = (
  ['skate', 'skate-puck', 'backward', 'lateral', 'pivot', 'stop', 'check'] as const
).filter((s) => !RELEASING_STYLES.has(s))

export function findRoute(drill: Drill, step: number, actor: string): PathMove | undefined {
  const move = drill.steps[step]?.moves.find((m) => m.actor === actor)
  return move?.points ? (move as PathMove) : undefined
}

/**
 * Make every route start where its actor really is.
 *
 * This is the ripple that keeps a drill consistent after an edit. A route's
 * first point must equal where the actor stands when its step begins, which is
 * wherever its previous route ended. So when you move an actor's start, change
 * where a route ends, delete a route or a step, or reorder steps, the routes
 * that follow have a stale first point. Rather than special-casing each edit,
 * every edit that can cause this calls reanchor.
 *
 * It only changes first points, and positions depend only on where routes end,
 * so one pass is enough. A route that already starts in the right place is
 * returned as the same object, so unchanged parts keep their identity.
 */
export function reanchor(drill: Drill): Drill {
  let plan
  try {
    plan = planDrill(drill)
  } catch {
    return drill // references are broken; leave it for the validator to report
  }
  let changed = false
  const steps = drill.steps.map((step, si) => {
    const before = plan.steps[si].before.positions
    const moves = step.moves.map((move): Move => {
      if (!move.points) return move
      const here = before.get(move.actor)
      if (!here || distance(here, move.points[0]) < 1e-6) return move
      changed = true
      return { ...move, points: [here, ...move.points.slice(1)] }
    })
    return moves.some((m, i) => m !== step.moves[i]) ? { ...step, moves } : step
  })
  return changed ? { ...drill, steps } : drill
}

// --- steps ---------------------------------------------------------------

export function addStep(drill: Drill, name?: string): Drill {
  const step: Step = name ? { name, moves: [] } : { moves: [] }
  return { ...drill, steps: [...drill.steps, step] }
}

export function renameStep(drill: Drill, index: number, name: string): Drill {
  if (!drill.steps[index]) return drill
  return {
    ...drill,
    steps: drill.steps.map((s, i) => {
      if (i !== index) return s
      const { name: _old, ...rest } = s
      return name === '' ? rest : { ...rest, name }
    }),
  }
}

export function deleteStep(drill: Drill, index: number): Drill {
  if (!drill.steps[index]) return drill
  return reanchor({ ...drill, steps: drill.steps.filter((_, i) => i !== index) })
}

/** Move a step earlier (-1) or later (+1). */
export function moveStep(drill: Drill, index: number, direction: -1 | 1): Drill {
  const target = index + direction
  if (!drill.steps[index] || !drill.steps[target]) return drill
  const steps = [...drill.steps]
  ;[steps[index], steps[target]] = [steps[target], steps[index]]
  return reanchor({ ...drill, steps })
}

// --- routes --------------------------------------------------------------

/**
 * Add a route for an actor in a step.
 *
 * Refused (the drill comes back unchanged) if the step or actor does not
 * exist, the actor already moves in that step, the actor is being carried
 * (a carried puck moves with its carrier), the style is not a route style, or
 * there are fewer than two points. The first point is taken from where the
 * actor really is at that step's start, whatever was passed, so a route can
 * never begin in the wrong place.
 */
export function addRoute(drill: Drill, step: number, actor: string, style: MoveStyle, points: readonly Point[]): Drill {
  const target = drill.steps[step]
  const who = drill.actors.find((a) => a.id === actor)
  if (!target || !who || who.carriedBy || !ROUTE_STYLES.includes(style) || points.length < 2) return drill
  if (target.moves.some((m) => m.actor === actor)) return drill

  const route: PathMove = { actor, style, points: points.map(clampToRink) }
  return reanchor({
    ...drill,
    steps: drill.steps.map((s, i) => (i === step ? { ...s, moves: [...s.moves, route] } : s)),
  })
}

function withRoute(drill: Drill, step: number, actor: string, change: (route: PathMove) => PathMove | null): Drill {
  const route = findRoute(drill, step, actor)
  if (!route) return drill
  const next = change(route)
  return reanchor({
    ...drill,
    steps: drill.steps.map((s, i) =>
      i !== step
        ? s
        : { ...s, moves: next ? s.moves.map((m) => (m === route ? next : m)) : s.moves.filter((m) => m !== route) },
    ),
  })
}

/** Replace a route's waypoints (dragging a vertex, adding or removing one). */
export function setRoutePoints(drill: Drill, step: number, actor: string, points: readonly Point[]): Drill {
  if (points.length < 2) return drill
  return withRoute(drill, step, actor, (r) => ({ ...r, points: points.map(clampToRink) }))
}

export interface RoutePatch {
  style?: MoveStyle
  /** Feet per second. `null` clears it, so the style's default speed applies. */
  speed?: number | null
  smooth?: boolean
}

export function updateRoute(drill: Drill, step: number, actor: string, patch: RoutePatch): Drill {
  if (patch.style !== undefined && !ROUTE_STYLES.includes(patch.style)) return drill
  if (typeof patch.speed === 'number' && !(patch.speed > 0)) return drill
  return withRoute(drill, step, actor, (r) => {
    const next: PathMove = { ...r }
    if (patch.style !== undefined) next.style = patch.style
    if (patch.speed === null) delete next.speed
    else if (patch.speed !== undefined) next.speed = patch.speed
    if (patch.smooth === false) delete next.smooth
    else if (patch.smooth) next.smooth = true
    return next
  })
}

export function deleteRoute(drill: Drill, step: number, actor: string): Drill {
  return withRoute(drill, step, actor, () => null)
}

// --- waypoints (pure helpers on a list of points) ---------------------------

/** Add a point after `afterIndex`, between that point and the next. */
export function insertPoint(points: readonly Point[], afterIndex: number, p: Point): Point[] {
  return [...points.slice(0, afterIndex + 1), p, ...points.slice(afterIndex + 1)]
}

/** Remove a point, but never the start or end, and never below two points. */
export function removePoint(points: readonly Point[], index: number): Point[] {
  if (index <= 0 || index >= points.length - 1 || points.length <= 2) return [...points]
  return points.filter((_, i) => i !== index)
}

export function movePoint(points: readonly Point[], index: number, p: Point): Point[] {
  return points.map((q, i) => (i === index ? p : q))
}
