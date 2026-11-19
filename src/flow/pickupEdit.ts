import { distance, pointAlong } from '../engine/geometry'
import { buildTimeline } from '../engine/timeline'
import type { Drill, Point } from '../engine/types'
import type { Starts } from './edit'
import type { LandingZone } from './passEdit'
import { segmentsFor } from './timeline'
import type { Flow, Marker, Pickup } from './types'
import type { TimelineModel } from './view'

/**
 * Picking up a loose puck in the flow view: where a puck is lying, where a skater's path
 * reaches it, and adding or removing the pickup. Pure functions, like the rest of edit.ts.
 */

/**
 * How close (feet) a skater has to get to a loose puck to collect it. The validator accepts up to
 * 2.5 ft (RECEIVE_TOLERANCE); this is a little inside that so a pickup the editor offers is never
 * one the validator then refuses over a rounding error.
 */
export const PICKUP_REACH = 2

/**
 * How far from a dumped puck a skater's path may pass and still be offered. Farther than
 * PICKUP_REACH, so choosing the pickup moves where the dump lands onto the skater (see
 * addPickup): "into the corner" does not mean a particular square foot, and nobody should have to
 * draw two lines within two feet of each other by eye.
 */
export const PICKUP_NEAR = 8

/** A puck lying loose: which one, where, and from when. */
export interface LooseSpot {
  puck: string
  point: Point
  /** When it stopped moving (seconds): a skater has to arrive after this. */
  since: number
  /** The pass or shot (index in flow.events) that left it here; it can be moved. Absent for a puck that starts loose. */
  event?: number
}

/**
 * Every place a puck is lying loose and still free to be picked up: a puck that starts without a
 * carrier, and the landing of any pass or shot that nobody receives. A spot that something
 * already collects (or that is carried again later) is not offered, so each loose puck can be
 * picked up once.
 */
export function looseSpots(drill: Drill, flow: Flow, model: TimelineModel): LooseSpot[] {
  const timeline = buildTimeline(drill)
  const found: LooseSpot[] = []
  const add = (puck: string, since: number) => {
    if (found.some((s) => s.puck === puck && Math.abs(s.since - since) < 0.01)) return
    const point = timeline.at(since)[puck]
    if (!point) return
    // Which pass or shot left it here, if one did: that is what can be moved onto the skater.
    const event = model.links.findIndex((l, i) => flow.events[i]?.puck === puck && l.to.actor === null && Math.abs(l.to.t - since) < 0.01)
    found.push({ puck, point, since, ...(event >= 0 ? { event } : {}) })
  }
  for (const row of model.pucks) {
    // Loose and not flying: it has stopped. (A span that ends the drill's timeline is included.)
    for (const span of row.spans) if (span.carrier === null && !span.flight) add(row.actor, span.t0)
  }
  // A pass or shot that lands on nobody, at the very end of the drill, leaves no span to find.
  model.links.forEach((link, i) => {
    const event = flow.events[i]
    if (event && link.to.actor === null) add(event.puck, link.to.t)
  })
  return found.filter((spot) => {
    const row = model.pucks.find((p) => p.actor === spot.puck)
    // Free means nobody carries it from then on.
    return !row?.spans.some((s) => s.carrier !== null && s.t0 >= spot.since - 0.01)
  })
}

/** How finely a run is checked, in feet. */
const SAMPLE = 0.25

/**
 * Every stretch of every skater's runs where they are within reach of a loose puck, after it has
 * stopped. Drawn in green to aim at, like the landing zones for a pass. The very start of a run
 * is left out: a pickup is where a move *ends*, and a run's first instant has no move before it.
 */
export function pickupZones(flow: Flow, starts: Starts, spot: LooseSpot): LandingZone[] {
  const zones: LandingZone[] = []
  // A dump that will be moved onto the skater lands a touch earlier or later than it does now, so
  // leave a margin: the skater must clearly arrive after it, not at the same instant.
  const movable = spot.event !== undefined
  const radius = movable ? PICKUP_NEAR : PICKUP_REACH
  const margin = movable ? 0.3 : 0
  for (const [actor, pieces] of Object.entries(flow.paths)) {
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
        const reaches = arc > 0.05 && seg.t0 + arc / seg.speed >= spot.since + margin - 1e-3 && distance(point, spot.point) <= radius
        if (reaches) {
          if (!open) open = { from: arc, points: [] }
          open.points.push(point)
        } else close(arc)
      }
      close(seg.length)
    }
  }
  return zones
}

export interface PickupSnap {
  marker: Marker
  point: Point
}

/**
 * The pickup a click means: the stretch of green nearest the click (within `radius` feet), and
 * in it the point closest to the puck, so the skater ends their run right on it.
 */
export function bestPickup(zones: readonly LandingZone[], spot: LooseSpot, click: Point, radius: number): PickupSnap | null {
  let nearest: { zone: LandingZone; d: number } | null = null
  for (const zone of zones) {
    for (const p of zone.points) {
      const d = distance(p, click)
      if (d <= radius && (!nearest || d < nearest.d)) nearest = { zone, d }
    }
  }
  if (!nearest) return null
  const { zone } = nearest
  const steps = zone.points.length - 1
  let best = 0
  zone.points.forEach((p, i) => {
    if (distance(p, spot.point) < distance(zone.points[best], spot.point)) best = i
  })
  const arc = steps <= 0 ? zone.from : zone.from + ((zone.to - zone.from) * best) / steps
  return { marker: { actor: zone.actor, piece: zone.piece, at: arc }, point: zone.points[best] }
}

/**
 * Add a pickup. If it was chosen at a spot a little way from the puck (`at`, with the loose
 * spot it was chosen for), the pass or shot that left the puck there is moved to land on `at`
 * instead: the skater collects it where their run is, and the puck is there waiting.
 */
export function addPickup(flow: Flow, pickup: Pickup, moveDumpTo?: { spot: LooseSpot; at: Point }): Flow {
  let events = flow.events
  const index = moveDumpTo?.spot.event
  if (moveDumpTo && index !== undefined) {
    events = flow.events.map((e, i) =>
      i === index && e.target.kind === 'point' ? { ...e, target: { ...e.target, at: [moveDumpTo.at[0], moveDumpTo.at[1]] as Point } } : e,
    )
  }
  return { ...flow, events, pickups: [...(flow.pickups ?? []), pickup] }
}

export function removePickup(flow: Flow, index: number): Flow {
  if (!flow.pickups?.[index]) return flow
  const pickups = flow.pickups.filter((_, i) => i !== index)
  const { pickups: _old, ...rest } = flow
  return pickups.length > 0 ? { ...rest, pickups } : rest
}
