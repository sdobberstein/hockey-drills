import { distance, nearestAlongPath, pathLength } from './geometry'
import { planDrill, type PlannedMove } from './plan'
import { landingSpot } from './receive'
import { buildTimeline } from './timeline'
import type { Drill, Point } from './types'

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
  /** Machine-readable fix, when we can work one out (see receiver-misses-pass). */
  suggestion?: Suggestion
}

/**
 * Concrete changes that would fix an issue. Either one alone is enough; they
 * are alternatives, not a pair. An editor could apply one with a click.
 */
export interface Suggestion {
  /** Straight passes only: land here, where puck and receiver can arrive together. */
  landAt?: Point
  /** Or change the pass speed (ft/s) so the puck arrives as the receiver reaches the landing spot. */
  passSpeed?: number
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
  | 'continues-while-carried'
  | 'carried-actor-moves'
  | 'receiver-misses-pass'
  | 'pickup-not-loose'
  | 'pickup-misses-puck'

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
      if (move.picksUp !== undefined && actors.get(move.picksUp)?.type !== 'puck') {
        issues.push({
          code: 'unknown-target',
          message: `Move says "${move.actor}" picks up "${move.picksUp}", which is not a puck in this drill.`,
          location: `steps[${si}].moves[${mi}]`,
        })
      }
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

      if (move.picksUp) {
        // Where the puck is lying when this skater's move ends, and whether it is free to take.
        // In the same step the puck may be flying (it must have landed first, with nobody named to
        // receive it) or carried (someone has it); from an earlier step it simply sits.
        const puckMove = step.moves.find((m) => m.actor === move.picksUp)
        const holder = step.before.carriers.get(move.picksUp)
        let lying: Point | undefined
        if (puckMove?.receiver) {
          issues.push({
            code: 'pickup-not-loose',
            message: `"${move.picksUp}" is passed to ${puckMove.receiver} in this step, so ${move.actor} cannot pick it up too.`,
            location,
          })
        } else if (puckMove && puckMove.duration > move.duration + 1e-6) {
          issues.push({
            code: 'pickup-not-loose',
            message: `${move.actor} gets there after ${move.duration.toFixed(2)}s but "${move.picksUp}" is still in the air until ${puckMove.duration.toFixed(2)}s. Put the pickup in a later step, or slow ${move.actor} down.`,
            location,
          })
        } else if (!puckMove && holder) {
          issues.push({
            code: 'pickup-not-loose',
            message: `${holder} is carrying "${move.picksUp}" at this point, so ${move.actor} cannot pick it up. Pass or shoot it first.`,
            location,
          })
        } else {
          lying = puckMove ? puckMove.path[puckMove.path.length - 1] : step.before.positions.get(move.picksUp)
        }
        const reach = move.path[move.path.length - 1]
        if (lying && distance(lying, reach) > RECEIVE_TOLERANCE) {
          issues.push({
            code: 'pickup-misses-puck',
            message: `${move.actor} finishes at [${fmt(reach)}] but "${move.picksUp}" is lying at [${fmt(lying)}], ${distance(lying, reach).toFixed(1)} ft away. End ${move.actor}'s run on the puck.`,
            location,
          })
        }
      }

      if (move.releases) {
        if (types.get(move.actor) !== 'puck') {
          issues.push({
            code: 'release-style-needs-puck',
            message: `"${move.style}" is a puck movement; it must be a move of the puck, not "${move.actor}".`,
            location,
          })
        } else if (move.continues) {
          // A flight carrying on from an earlier step: the puck must already be in the air.
          if (carrier) {
            issues.push({
              code: 'continues-while-carried',
              message: `"${move.actor}" is marked as a flight carrying on, but ${carrier} is carrying it at this point.`,
              location,
            })
          }
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
            const suggestion = suggestFix(step.moves, move, there, lands)
            issues.push({
              code: 'receiver-misses-pass',
              message:
                `The ${move.style} lands at [${fmt(lands)}] after ${move.duration.toFixed(2)}s, but "${move.receiver}" is at [${fmt(there)}] then.` +
                describe(suggestion, move.receiver, lands),
              location,
              suggestion,
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

/**
 * Work out what would make a missed pass land on its receiver.
 *
 * Two independent fixes, because they suit different situations:
 *  - if the receiver's route already passes through the landing spot, change
 *    the pass speed so the puck arrives at the moment the receiver does. We
 *    find how far along their route the landing spot is, divide by their
 *    speed to get a time, then pick the speed that covers the pass in that
 *    time. Works for any pass, including a bank off the boards.
 *  - for a straight pass, move the landing spot to where puck and receiver
 *    can arrive together (see landingSpot). We do not offer this for a pass
 *    that bends, because moving its end would leave the bend pointing the
 *    wrong way and we cannot guess how the author wants it reshaped.
 */
function suggestFix(moves: readonly PlannedMove[], pass: PlannedMove, there: Point, lands: Point): Suggestion {
  const suggestion: Suggestion = {}
  const route = moves.find((m) => m.actor === pass.receiver)

  if (route) {
    const onRoute = nearestAlongPath(route.path, lands)
    if (onRoute.distance <= RECEIVE_TOLERANCE && onRoute.arc > 0) {
      // One decimal place: a speed like 42.16502433248772 is noise to a person, and
      // the difference is far inside the receiving tolerance.
      suggestion.passSpeed = Math.round((pathLength(pass.path) / (onRoute.arc / route.speed)) * 10) / 10
    }
  }
  if (pass.path.length === 2) {
    const spot = landingSpot(pass.path[0], pass.speed, route?.path, route?.speed ?? 1, there)
    suggestion.landAt = [Math.round(spot[0] * 10) / 10, Math.round(spot[1] * 10) / 10]
  }
  return suggestion
}

function describe(suggestion: Suggestion, receiver: string, lands: Point): string {
  const parts: string[] = []
  if (suggestion.passSpeed !== undefined) {
    parts.push(`set the pass speed to ${suggestion.passSpeed.toFixed(1)} ft/s so it arrives as ${receiver} reaches [${fmt(lands)}]`)
  }
  if (suggestion.landAt) parts.push(`land the pass at [${fmt(suggestion.landAt)}], where ${receiver} can meet it`)
  if (parts.length === 0) return ' Adjust the pass target, speed, or the receiver\'s route.'
  return ` To fix: ${parts.join(', or ')}.`
}
