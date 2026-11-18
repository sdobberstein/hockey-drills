import { distance } from './geometry'
import { planDrill } from './plan'
import { buildTimeline } from './timeline'
import type { Drill } from './types'

/**
 * Semantic validation: the rules a JSON Schema cannot express because they
 * need cross-references ("does this actor id exist?") or simulation ("is the
 * puck still being carried at this point?").
 *
 * The flow is two-phase on purpose:
 *   1. Reference checks. If any fail, we stop: the plan cannot be built
 *      safely on dangling ids.
 *   2. State checks, run against the plan from planDrill().
 *
 * Input is assumed to have already passed schema/drill.schema.json.
 */

export interface Issue {
  /** Stable machine-readable code, handy for tests and UI messages. */
  code: IssueCode
  message: string
  /** Where in the drill, e.g. "steps[2].moves[0]". */
  location: string
}

export type IssueCode =
  | 'duplicate-actor-id'
  | 'unknown-carrier'
  | 'unknown-actor'
  | 'unknown-target'
  | 'duplicate-move'
  | 'path-start-mismatch'
  | 'release-style-needs-puck'
  | 'release-without-carrier'
  | 'carried-actor-moves'
  | 'receiver-misses-pass'

/** How far (feet) a path's first point may be from where the actor is. */
export const PATH_START_TOLERANCE = 0.5

/**
 * How far (feet) a receiver may be from where a pass lands, at the moment it
 * lands. A few feet is a pickup in stride; more means the pass and the
 * receiver's route were not timed together.
 */
export const RECEIVE_TOLERANCE = 2.5

export function validateDrill(drill: Drill): Issue[] {
  const issues = checkReferences(drill)
  if (issues.length > 0) return issues
  return checkState(drill)
}

function checkReferences(drill: Drill): Issue[] {
  const issues: Issue[] = []
  const actors = new Map(drill.actors.map((a) => [a.id, a]))

  const seen = new Set<string>()
  drill.actors.forEach((actor, i) => {
    if (seen.has(actor.id)) {
      issues.push({
        code: 'duplicate-actor-id',
        message: `Actor id "${actor.id}" is used more than once.`,
        location: `actors[${i}]`,
      })
    }
    seen.add(actor.id)

    if (actor.carriedBy !== undefined) {
      const carrier = actors.get(actor.carriedBy)
      // A carrier must be a real actor that is not itself carried; this keeps
      // "who is carrying the puck" a single hop instead of a chain.
      if (!carrier || carrier.id === actor.id || carrier.carriedBy !== undefined) {
        issues.push({
          code: 'unknown-carrier',
          message: `"${actor.id}" is carried by "${actor.carriedBy}", which is missing, itself, or also carried.`,
          location: `actors[${i}]`,
        })
      }
    }
  })

  drill.steps.forEach((step, si) => {
    const movers = new Set<string>()
    step.moves.forEach((move, mi) => {
      const location = `steps[${si}].moves[${mi}]`
      if (!actors.has(move.actor)) {
        issues.push({
          code: 'unknown-actor',
          message: `Move refers to unknown actor "${move.actor}".`,
          location,
        })
      }
      if (movers.has(move.actor)) {
        issues.push({
          code: 'duplicate-move',
          message: `"${move.actor}" has more than one move in the same step; use a separate step.`,
          location,
        })
      }
      movers.add(move.actor)
      if (move.receiver !== undefined && !actors.has(move.receiver)) {
        issues.push({
          code: 'unknown-target',
          message: `Move names unknown receiver "${move.receiver}".`,
          location,
        })
      }
      if (typeof move.to === 'string' && !actors.has(move.to)) {
        issues.push({
          code: 'unknown-target',
          message: `Move targets unknown actor "${move.to}".`,
          location,
        })
      }
    })
  })

  return issues
}

function checkState(drill: Drill): Issue[] {
  const issues: Issue[] = []
  const types = new Map(drill.actors.map((a) => [a.id, a.type]))
  const plan = planDrill(drill)
  const timeline = buildTimeline(drill)

  plan.steps.forEach((step, si) => {
    step.moves.forEach((move, mi) => {
      const location = `steps[${si}].moves[${mi}]`
      const carrier = step.before.carriers.get(move.actor)

      // A path must begin where the actor actually is, otherwise the actor
      // would teleport at the start of the step.
      const here = step.before.positions.get(move.actor)!
      if (distance(here, move.path[0]) > PATH_START_TOLERANCE) {
        issues.push({
          code: 'path-start-mismatch',
          message: `"${move.actor}" is at [${here}] but its path starts at [${move.path[0]}].`,
          location,
        })
      }

      if (move.releases) {
        if (types.get(move.actor) !== 'puck') {
          issues.push({
            code: 'release-style-needs-puck',
            message: `"${move.style}" is a puck movement; it must be a move of the puck, not "${move.actor}".`,
            location,
          })
        } else if (!carrier) {
          issues.push({
            code: 'release-without-carrier',
            message: `"${move.actor}" is ${move.style}ed but nobody is carrying it at this point.`,
            location,
          })
        }
        if (move.receiver) {
          // The receiver may be skating (a pickup in stride), so ask the
          // timeline where they are at the instant the puck arrives, and
          // compare with where the pass lands. This replaces the old rule that
          // receivers had to stand still, which real passes do not.
          const lands = move.path[move.path.length - 1]
          const there = timeline.at(step.start + move.duration)[move.receiver]
          if (distance(there, lands) > RECEIVE_TOLERANCE) {
            issues.push({
              code: 'receiver-misses-pass',
              message: `The ${move.style} lands at [${fmt(lands)}] after ${move.duration.toFixed(2)}s, but "${move.receiver}" is at [${fmt(there)}] then. Adjust the pass target, speed, or the receiver's route.`,
              location,
            })
          }
        }
      } else if (carrier) {
        issues.push({
          code: 'carried-actor-moves',
          message: `"${move.actor}" is carried by "${carrier}" and cannot move on its own; move the carrier instead.`,
          location,
        })
      }
    })
  })

  return issues
}

const fmt = (p: readonly [number, number]) => p.map((n) => n.toFixed(1)).join(', ')
