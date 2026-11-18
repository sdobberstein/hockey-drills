import { distance } from '../engine/geometry'
import { planDrill, type PlannedMove } from '../engine/plan'
import type { Drill, Point } from '../engine/types'
import { RECEIVE_TOLERANCE } from '../engine/validate'
import { clampToRink } from './rink'
import { findMove, isRelease, passesTiedToRunEnd, retimePass, tieToRunEnd, updateRelease } from './releases'
import { addRoute, findRoute, reanchor } from './routes'

/**
 * Finding and fixing the places where a skater stops and starts.
 *
 * A step lasts as long as its slowest move, so anyone whose route finishes
 * sooner stands still until the step ends. In a real rep that reads as a
 * skater stopping to wait for a pass. These functions find those stops and
 * offer fixes. They are advice, not errors: a drill with a deliberate pause is
 * still a valid drill.
 */

/** A pause shorter than this (seconds) is not noticeable, so it is not reported. */
export const MIN_WAIT = 0.15

export interface Wait {
  step: number
  actor: string
  /** How long they stand still, in seconds. */
  idle: number
  /**
   * `early`: their route ends before the step does. `still`: they skated in the
   * previous step but have no move at all in this one.
   */
  kind: 'early' | 'still'
}

/** A skater standing through a whole step is only worth mentioning if the step is long enough to notice. */
export const MIN_STILL = 0.3

/** Everyone who stands still when they should be skating on: see Wait. */
export function findWaits(drill: Drill, minIdle = MIN_WAIT): Wait[] {
  let plan
  try {
    plan = planDrill(drill)
  } catch {
    return []
  }
  const waits: Wait[] = []
  const skaters = new Set(drill.actors.filter((a) => a.type === 'forward' || a.type === 'defender').map((a) => a.id))
  plan.steps.forEach((step, si) => {
    for (const move of step.moves) {
      // The puck is not a skater: a pass that lands early is not anyone standing still.
      if (move.releases) continue
      const idle = step.duration - move.duration
      if (idle >= minIdle) waits.push({ step: si, actor: move.actor, idle, kind: 'early' })
    }
    if (si === 0 || step.duration < MIN_STILL) return
    const moving = new Set(step.moves.map((m) => m.actor))
    const skatedBefore = new Set(plan.steps[si - 1].moves.filter((m) => !m.releases).map((m) => m.actor))
    for (const id of skaters) {
      if (!moving.has(id) && skatedBefore.has(id)) waits.push({ step: si, actor: id, idle: step.duration, kind: 'still' })
    }
  })
  return waits
}

/**
 * Fix 1: keep the skater moving until the step ends, by carrying their route
 * on in the direction they were already going.
 *
 * The last point moves further along the final segment, far enough that the
 * route lasts as long as the step (at the same speed). Later routes for that
 * actor re-anchor to the new end, so the actor is continuous. Any straight pass
 * to them in this step is then re-timed, since they now arrive somewhere
 * different. The drill comes back unchanged if there is nothing to extend or
 * the route is already at the boards.
 */
export function extendRoute(drill: Drill, step: number, actor: string): Drill {
  const route = findRoute(drill, step, actor)
  let plan
  try {
    plan = planDrill(drill)
  } catch {
    return drill
  }
  const planned = plan.steps[step]?.moves.find((m) => m.actor === actor)
  if (!route || !planned) return drill
  const idle = plan.steps[step].duration - planned.duration
  if (idle < 1e-6) return drill

  const [a, b] = [route.points[route.points.length - 2], route.points[route.points.length - 1]]
  const length = distance(a, b)
  if (length === 0) return drill
  const extra = idle * planned.speed
  const end = clampToRink([b[0] + ((b[0] - a[0]) / length) * extra, b[1] + ((b[1] - a[1]) / length) * extra])
  if (distance(end, b) < 0.05) return drill // already at the boards

  const tied = passesTiedToRunEnd(drill, step, actor)
  let next = reanchor({
    ...drill,
    steps: drill.steps.map((s, i) =>
      i !== step
        ? s
        : { ...s, moves: s.moves.map((m) => (m === route ? { ...route, points: [...route.points.slice(0, -1), end] } : m)) },
    ),
  })
  // Anyone passing to this skater has to aim at where they will now be. A pass that
  // landed at the end of the run follows it, with its speed re-solved so the puck
  // still arrives as they do; any other pass is re-timed to meet them along the run.
  for (const move of next.steps[step].moves) {
    if (isRelease(move) && (move.receiver ?? (typeof move.to === 'string' ? move.to : undefined)) === actor) {
      next = tied.includes(move.actor) ? tieToRunEnd(next, step, move.actor) : retimePass(next, step, move.actor)
    }
  }
  return next
}

/**
 * Fix for a skater who stands through a whole step: have them keep going the
 * way they were, for as long as the step lasts, at the speed they were using.
 */
export function continueSkating(drill: Drill, step: number, actor: string): Drill {
  let plan
  try {
    plan = planDrill(drill)
  } catch {
    return drill
  }
  const previous = plan.steps[step - 1]?.moves.find((m) => m.actor === actor)
  const here = plan.steps[step]?.before.positions.get(actor)
  const duration = plan.steps[step]?.duration ?? 0
  if (!previous || previous.releases || !here || duration <= 0) return drill

  const path = previous.path
  const [a, b] = [path[path.length - 2], path[path.length - 1]]
  const length = distance(a, b)
  if (length === 0) return drill
  const reach = previous.speed * duration
  const end = clampToRink([here[0] + ((b[0] - a[0]) / length) * reach, here[1] + ((b[1] - a[1]) / length) * reach])
  if (distance(here, end) < 0.05) return drill
  // Carrying the puck? Keep the symbol for it.
  const carrying = [...plan.steps[step].before.carriers.values()].includes(actor)
  return addRoute(drill, step, actor, carrying ? 'skate-puck' : 'skate', [here, end])
}

export interface PassSpeedFix {
  /** The puck whose pass would be sped up. */
  puck: string
  /** Feet per second, to one decimal place. */
  speed: number
}

/**
 * Fix 2: if the pass is what is holding the step open, speed it up so it
 * arrives just as the receiver finishes their route.
 *
 * Only offered when the pass lands where the receiver's route ends (within the
 * receive tolerance) and the pass is the slowest move, so a faster pass really
 * does shorten the wait. The receiver then arrives and the puck meets them,
 * rather than them standing there for it.
 */
export function passSpeedFix(drill: Drill, wait: Wait): PassSpeedFix | null {
  let plan
  try {
    plan = planDrill(drill)
  } catch {
    return null
  }
  const step = plan.steps[wait.step]
  const route: PlannedMove | undefined = step?.moves.find((m) => m.actor === wait.actor)
  if (!step || !route) return null

  for (const pass of step.moves) {
    if (!pass.releases) continue
    const receiver = pass.receiver
    if (receiver !== wait.actor) continue
    const lands = pass.path[pass.path.length - 1]
    const routeEnd: Point = route.path[route.path.length - 1]
    const holdsStepOpen = pass.duration >= step.duration - 1e-6
    if (!holdsStepOpen || distance(lands, routeEnd) > RECEIVE_TOLERANCE || route.duration <= 0) continue
    const length = pass.path.reduce((sum, p, i) => (i === 0 ? 0 : sum + distance(pass.path[i - 1], p)), 0)
    const speed = Math.round((length / route.duration) * 10) / 10
    if (speed > pass.speed + 0.05) return { puck: pass.actor, speed }
  }
  return null
}

export function applyPassSpeedFix(drill: Drill, step: number, fix: PassSpeedFix): Drill {
  return findMove(drill, step, fix.puck) ? updateRelease(drill, step, fix.puck, { speed: fix.speed }) : drill
}
