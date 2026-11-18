import { landingSpot } from '../engine/receive'
import { planDrill, RELEASING_STYLES } from '../engine/plan'
import type { Drill, Move, MoveStyle, Point, TargetMove } from '../engine/types'
import type { Suggestion } from '../engine/validate'
import { clampToRink } from './rink'
import { reanchor } from './routes'

/**
 * Editing the puck's releases: passes, shots and drop passes. Like routes.ts
 * these are pure functions returning a new drill.
 *
 * A release is a move of the *puck*, starting where its carrier stands when
 * the step begins. It can aim at a teammate (`to: id`), at a spot (`to:
 * [x, y]`), or follow a path (a bank off the boards). Where the receiver is
 * skating, `receiver` names who picks it up; getting the timing right between
 * the pass and a moving receiver is what retimePass and applySuggestion are for.
 */

/** The styles that let go of the puck. */
export const RELEASE_STYLES: readonly MoveStyle[] = (['pass', 'shoot', 'drop-pass'] as const).filter((s) =>
  RELEASING_STYLES.has(s),
)

export const isRelease = (move: Move) => RELEASING_STYLES.has(move.style)

/** Any move by an actor in a step: a route or a release. */
export function findMove(drill: Drill, step: number, actor: string): Move | undefined {
  return drill.steps[step]?.moves.find((m) => m.actor === actor)
}

/** Who carries the puck when a step begins, or undefined if nobody (or the drill cannot be planned). */
export function carrierAt(drill: Drill, step: number, puck: string): string | undefined {
  try {
    return planDrill(drill).steps[step]?.before.carriers.get(puck)
  } catch {
    return undefined
  }
}

export type ReleaseTarget =
  | { kind: 'actor'; id: string }
  | { kind: 'point'; at: Point }
  | { kind: 'path'; points: readonly Point[] }

/**
 * Add a pass, shot or drop pass for a puck in a step.
 *
 * Refused (the drill comes back unchanged) unless the step exists, the actor
 * is a puck with no move yet in that step that somebody is carrying when the
 * step begins, and the style is a release style. A bank needs at least two
 * points. `receiver` is optional: it is implied when the target is an actor.
 */
export function addRelease(
  drill: Drill,
  step: number,
  puck: string,
  style: MoveStyle,
  target: ReleaseTarget,
  receiver?: string,
): Drill {
  const target_ = drill.steps[step]
  const who = drill.actors.find((a) => a.id === puck)
  if (!target_ || who?.type !== 'puck' || !RELEASE_STYLES.includes(style)) return drill
  if (target_.moves.some((m) => m.actor === puck) || carrierAt(drill, step, puck) === undefined) return drill
  if (target.kind === 'actor' && !drill.actors.some((a) => a.id === target.id)) return drill
  if (receiver !== undefined && !drill.actors.some((a) => a.id === receiver)) return drill
  if (target.kind === 'path' && target.points.length < 2) return drill

  let move: Move
  if (target.kind === 'actor') move = { actor: puck, style, to: target.id }
  else if (target.kind === 'point') move = { actor: puck, style, to: clampToRink(target.at) }
  else move = { actor: puck, style, points: target.points.map(clampToRink) }
  if (receiver !== undefined && typeof move.to !== 'string') move = { ...move, receiver }

  return reanchor({
    ...drill,
    steps: drill.steps.map((s, i) => (i === step ? { ...s, moves: [...s.moves, move] } : s)),
  })
}

function withMove(drill: Drill, step: number, actor: string, change: (move: Move) => Move | null): Drill {
  const move = findMove(drill, step, actor)
  if (!move) return drill
  const next = change(move)
  return reanchor({
    ...drill,
    steps: drill.steps.map((s, i) =>
      i !== step
        ? s
        : { ...s, moves: next ? s.moves.map((m) => (m === move ? next : m)) : s.moves.filter((m) => m !== move) },
    ),
  })
}

/** Delete any move, route or release. */
export function deleteMove(drill: Drill, step: number, actor: string): Drill {
  return withMove(drill, step, actor, () => null)
}

export interface ReleasePatch {
  style?: MoveStyle
  /** Feet per second; `null` clears it so the style's default applies. */
  speed?: number | null
  /** Who picks it up; `null` clears it. */
  receiver?: string | null
}

export function updateRelease(drill: Drill, step: number, actor: string, patch: ReleasePatch): Drill {
  const move = findMove(drill, step, actor)
  if (!move || !isRelease(move)) return drill
  if (patch.style !== undefined && !RELEASE_STYLES.includes(patch.style)) return drill
  if (typeof patch.speed === 'number' && !(patch.speed > 0)) return drill
  if (typeof patch.receiver === 'string' && !drill.actors.some((a) => a.id === patch.receiver)) return drill

  return withMove(drill, step, actor, (m) => {
    const next: Move = { ...m }
    if (patch.style !== undefined) next.style = patch.style
    if (patch.speed === null) delete next.speed
    else if (patch.speed !== undefined) next.speed = patch.speed
    if (patch.receiver === null) delete next.receiver
    else if (patch.receiver !== undefined) next.receiver = patch.receiver
    return next
  })
}

/**
 * Move where a straight release lands.
 *
 * If it was aimed at a teammate and had no explicit receiver, that teammate
 * becomes the receiver: dragging a pass away from a player turns it into a
 * lead pass to that player, not a pass to nobody.
 */
export function setLanding(drill: Drill, step: number, actor: string, at: Point): Drill {
  const move = findMove(drill, step, actor)
  if (!move || !isRelease(move) || move.points) return drill
  return withMove(drill, step, actor, (m) => {
    // Not a path move (checked above), so it is a move that names a target.
    const aimed = m as TargetMove
    const receiver = aimed.receiver ?? (typeof aimed.to === 'string' ? aimed.to : undefined)
    const next: TargetMove = { ...aimed, to: clampToRink(at) }
    if (receiver !== undefined) next.receiver = receiver
    return next
  })
}

/**
 * Re-time a straight pass onto a skating receiver.
 *
 * Holds the speeds fixed and moves the landing spot to where the puck and the
 * receiver arrive together (see landingSpot), which is the agreed default for
 * the editor (PLAN.md, "Authoring helpers"). If the receiver stands still in
 * that step the pass just aims at them. A banked pass (more than two points)
 * is left alone: moving its end would leave the bend pointing the wrong way.
 */
export function retimePass(drill: Drill, step: number, actor: string): Drill {
  const move = findMove(drill, step, actor)
  if (!move || !isRelease(move)) return drill
  if (move.points && move.points.length > 2) return drill
  const receiver = move.receiver ?? (typeof move.to === 'string' ? move.to : undefined)
  if (receiver === undefined) return drill

  let plan
  try {
    plan = planDrill(drill)
  } catch {
    return drill
  }
  const planned = plan.steps[step]
  const pass = planned?.moves.find((m) => m.actor === actor)
  if (!planned || !pass) return drill
  const route = planned.moves.find((m) => m.actor === receiver)
  const standing = planned.before.positions.get(receiver)
  if (!standing) return drill

  return withMove(drill, step, actor, (m) => {
    const { points: _path, to: _to, receiver: _receiver, ...rest } = m
    // A receiver who does not move is simply aimed at; one who does gets a landing spot.
    if (!route) return { ...rest, to: receiver } as Move
    const spot = landingSpot(pass.path[0], pass.speed, route.path, route.speed, standing)
    return { ...rest, to: clampToRink(spot), receiver } as Move
  })
}

/**
 * Apply a validator suggestion (see Suggestion in validate.ts) to the move an
 * issue points at. `location` is the issue's "steps[i].moves[j]".
 */
export function applySuggestion(drill: Drill, location: string, suggestion: Suggestion): Drill {
  const match = /^steps\[(\d+)\]\.moves\[(\d+)\]$/.exec(location)
  if (!match) return drill
  const step = Number(match[1])
  const move = drill.steps[step]?.moves[Number(match[2])]
  if (!move) return drill

  let next = drill
  if (suggestion.passSpeed !== undefined) {
    next = updateRelease(next, step, move.actor, { speed: suggestion.passSpeed })
  } else if (suggestion.landAt) {
    next = setLanding(next, step, move.actor, suggestion.landAt)
  }
  return next
}
