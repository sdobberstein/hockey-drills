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

/** A puck lying loose: which one, where, and from when. */
export interface LooseSpot {
  puck: string
  point: Point
  /** When it stopped moving (seconds): a skater has to arrive after this. */
  since: number
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
    if (point) found.push({ puck, point, since })
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
        const reaches = arc > 0.05 && seg.t0 + arc / seg.speed >= spot.since - 1e-3 && distance(point, spot.point) <= PICKUP_REACH
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

export function addPickup(flow: Flow, pickup: Pickup): Flow {
  return { ...flow, pickups: [...(flow.pickups ?? []), pickup] }
}

export function removePickup(flow: Flow, index: number): Flow {
  if (!flow.pickups?.[index]) return flow
  const pickups = flow.pickups.filter((_, i) => i !== index)
  const { pickups: _old, ...rest } = flow
  return pickups.length > 0 ? { ...rest, pickups } : rest
}
