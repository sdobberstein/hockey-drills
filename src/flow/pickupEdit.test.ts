import { describe, expect, it } from 'vitest'
import { buildTimeline } from '../engine/timeline'
import type { Drill } from '../engine/types'
import { compileFlow } from './compile'
import { drillToFlow } from './import'
import { addPickup, bestPickup, looseSpots, pickupZones, PICKUP_REACH, removePickup } from './pickupEdit'
import type { Flow } from './types'
import { buildTimelineModel } from './view'

const CORNER: [number, number] = [190, 5]
const base = (): Drill => ({
  version: 1,
  id: 'dump',
  title: 'Dump',
  rink: 'full',
  actors: [
    { id: 'F1', type: 'forward', start: [100, 40] },
    { id: 'F2', type: 'forward', start: [120, 60] },
    { id: 'puck', type: 'puck', start: [100, 40], carriedBy: 'F1' },
  ],
  steps: [],
})
const starts = { F1: [100, 40], F2: [120, 60] } as const

/** F1 dumps it in; F2 skates a path that goes through the corner and on. */
const dumped = (): { drill: Drill; flow: Flow } => {
  const flow: Flow = {
    paths: { F2: [{ kind: 'run', style: 'skate', points: [[120, 60], [185, 20], CORNER, [170, 30]] }] },
    events: [{ puck: 'puck', style: 'pass', from: { actor: 'F1', piece: 0, at: 0 }, target: { kind: 'point', at: CORNER } }],
  }
  const drill = compileFlow(base(), flow).drill
  return { drill, flow: drillToFlow(drill)! }
}

describe('where a puck is lying loose', () => {
  it('is where a pass to nobody lands, from when it lands', () => {
    const { drill, flow } = dumped()
    const spots = looseSpots(drill, flow, buildTimelineModel(drill)!)
    expect(spots).toHaveLength(1)
    expect(spots[0].puck).toBe('puck')
    expect(Math.hypot(spots[0].point[0] - CORNER[0], spots[0].point[1] - CORNER[1])).toBeLessThan(0.1)
    expect(spots[0].since).toBeGreaterThan(1)
  })

  it('includes a puck that starts without a carrier', () => {
    const d = base()
    d.actors[2] = { id: 'puck', type: 'puck', start: [60, 30] }
    const flow: Flow = { paths: { F2: [{ kind: 'run', style: 'skate', points: [[120, 60], [90, 45]] }] }, events: [] }
    const drill = compileFlow(d, flow).drill
    const spots = looseSpots(drill, drillToFlow(drill)!, buildTimelineModel(drill)!)
    expect(spots).toEqual([{ puck: 'puck', point: [60, 30], since: 0 }])
  })

  it('is not offered again once someone picks it up', () => {
    const { drill, flow } = dumped()
    const spot = looseSpots(drill, flow, buildTimelineModel(drill)!)[0]
    const snap = bestPickup(pickupZones(flow, starts, spot), spot, CORNER, 8)!
    const picked = compileFlow(base(), addPickup(flow, { puck: 'puck', marker: snap.marker })).drill
    const again = drillToFlow(picked)!
    expect(looseSpots(picked, again, buildTimelineModel(picked)!)).toEqual([])
  })

  it('is empty when someone is carrying the puck', () => {
    const drill = base()
    expect(looseSpots(drill, { paths: {}, events: [] }, buildTimelineModel(drill)!)).toEqual([])
  })
})

describe('where a skater can reach it', () => {
  const { drill, flow } = dumped()
  const spot = looseSpots(drill, flow, buildTimelineModel(drill)!)[0]
  const zones = pickupZones(flow, starts, spot)

  it('is the stretch of F2 s run that passes through the corner, and nothing else', () => {
    expect(zones.every((z) => z.actor === 'F2')).toBe(true)
    expect(zones.length).toBeGreaterThanOrEqual(1)
    for (const z of zones) for (const p of z.points) expect(Math.hypot(p[0] - spot.point[0], p[1] - spot.point[1])).toBeLessThanOrEqual(PICKUP_REACH + 1e-6)
  })

  it('does not include a skater who gets there before the puck has landed', () => {
    const early: Flow = { ...flow, paths: { F2: [{ kind: 'run', style: 'skate', speed: 45, points: [[120, 60], CORNER] }] } }
    const none = pickupZones(early, starts, { ...spot, since: 100 })
    expect(none).toEqual([])
  })

  it('snaps a click near the green to the point closest to the puck', () => {
    const snap = bestPickup(zones, spot, [CORNER[0] - 3, CORNER[1] + 3], 8)!
    expect(snap.marker.actor).toBe('F2')
    expect(Math.hypot(snap.point[0] - CORNER[0], snap.point[1] - CORNER[1])).toBeLessThan(0.6)
  })

  it('gives nothing for a click far from any green', () => {
    expect(bestPickup(zones, spot, [20, 20], 8)).toBeNull()
  })

  it('makes a drill that plays: the puck waits, then F2 has it, mid-run', () => {
    const snap = bestPickup(zones, spot, CORNER, 8)!
    const made = compileFlow(base(), addPickup(flow, { puck: 'puck', marker: snap.marker }))
    expect(made.problems).toEqual([])
    const tl = buildTimeline(made.drill)
    const end = tl.at(tl.duration)
    expect(Math.hypot(end.puck[0] - end.F2[0], end.puck[1] - end.F2[1])).toBeLessThan(0.1)
  })
})

describe('removing a pickup', () => {
  it('puts the puck back on the ice and drops the list when it is empty', () => {
    const { flow } = dumped()
    const withOne = addPickup(flow, { puck: 'puck', marker: { actor: 'F2', piece: 0, at: 60 } })
    expect(removePickup(withOne, 0).pickups).toBeUndefined()
    expect(removePickup(withOne, 5)).toBe(withOne)
  })
})
