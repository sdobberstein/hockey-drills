import { describe, expect, it } from 'vitest'
import { buildTimeline } from '../engine/timeline'
import type { Drill } from '../engine/types'
import { parseDrill } from '../engine/parse'
import { validateDrill } from '../engine/validate'
import { editViaFlow } from './apply'
import { compileFlow } from './compile'
import { drillToFlow } from './import'
import { addPass, locateOnPath } from './passEdit'
import { buildTimelineModel, mergedFlights } from './view'
import { planDrill } from '../engine/plan'
import type { Flow } from './types'

const base: Drill = {
  version: 1,
  id: 'flight',
  title: 'Flight',
  rink: 'full',
  actors: [
    { id: 'F1', type: 'forward', start: [30, 20] },
    { id: 'F2', type: 'forward', start: [30, 60] },
    { id: 'puck', type: 'puck', start: [30, 20], carriedBy: 'F1' },
  ],
  steps: [],
}

/** F1 skates five runs in different styles, as a path drawn with several style changes would. */
const manyStyles = (): Flow => ({
  paths: {
    F1: [
      { kind: 'run', style: 'skate-puck', points: [[30, 20], [60, 22]] },
      { kind: 'run', style: 'backward', points: [[60, 22], [80, 30]] },
      { kind: 'run', style: 'skate-puck', points: [[80, 30], [105, 34]] },
      { kind: 'run', style: 'lateral', points: [[105, 34], [120, 44]] },
      { kind: 'run', style: 'skate-puck', points: [[120, 44], [150, 46]] },
    ],
    F2: [{ kind: 'run', style: 'skate', points: [[30, 60], [150, 50]] }],
  },
  events: [],
})
const pathDrill = () => compileFlow(base, manyStyles()).drill

/** Where on F1's path a click at x lands, for the y that path has there. */
const yAt = (x: number) => (x < 60 ? 21 : x < 80 ? 26 : x < 105 ? 32 : x < 120 ? 39 : 45)

describe('a shot from anywhere along a path with several style changes', () => {
  it('is accepted from every point (it used to be refused from most)', () => {
    let refused = 0
    for (let x = 32; x <= 148; x += 4) {
      const result = editViaFlow(pathDrill(), (f, s) => {
        const from = locateOnPath(f, s, 'F1', [x, yAt(x)])
        return from && addPass(f, { puck: 'puck', style: 'shoot', from: from.marker, target: { kind: 'point', at: [190, 42] } })
      })!
      if (result.added.length > 0) refused++
      else expect(parseDrill(result.drill).issues, `shot from x=${x}`).toEqual([])
    }
    expect(refused).toBe(0)
  })

  it('writes the flight across the steps it is in the air for', () => {
    const result = editViaFlow(pathDrill(), (f, s) => {
      const from = locateOnPath(f, s, 'F1', [40, 21])!
      return addPass(f, { puck: 'puck', style: 'shoot', from: from.marker, target: { kind: 'point', at: [190, 42] } })
    })!
    const puck = result.drill.steps.flatMap((s) => s.moves).filter((m) => m.actor === 'puck')
    expect(puck.length).toBeGreaterThanOrEqual(2) // released in one step, carrying on in the next
    expect(puck[0].continues).toBeUndefined()
    expect(puck.slice(1).every((m) => m.continues)).toBe(true)
    expect(puck.at(-1)!.to).toEqual([190, 42]) // ends at the net
  })

  it('flies the puck in a straight line at a steady speed, with no jump at a step boundary', () => {
    const drill = editViaFlow(pathDrill(), (f, s) => {
      const from = locateOnPath(f, s, 'F1', [40, 21])!
      return addPass(f, { puck: 'puck', style: 'shoot', from: from.marker, target: { kind: 'point', at: [190, 42] } })
    })!.drill
    const tl = buildTimeline(drill)
    const flights = mergedFlights(planDrill(drill))
    expect(flights).toHaveLength(1)
    const { t0, t1 } = flights[0]
    let previous = tl.at(t0).puck
    for (let t = t0 + 0.02; t <= t1; t += 0.02) {
      const here = tl.at(t).puck
      const step = Math.hypot(here[0] - previous[0], here[1] - previous[1])
      expect(step).toBeLessThan(0.02 * 100 * 1.15) // 90 ft/s, nothing like a jump
      previous = here
    }
    expect(previous[0]).toBeGreaterThan(150)
  })
})

describe('importing a flight that spans steps', () => {
  const split = () =>
    editViaFlow(pathDrill(), (f, s) => {
      const from = locateOnPath(f, s, 'F1', [40, 21])!
      return addPass(f, { puck: 'puck', style: 'shoot', from: from.marker, target: { kind: 'point', at: [190, 42] } })
    })!.drill

  it('joins the stretches back into one event, with no bank where a step boundary was', () => {
    const flow = drillToFlow(split())!
    expect(flow.events).toHaveLength(1)
    expect(flow.events[0].target).toEqual({ kind: 'point', at: [190, 42] }) // no `via`
  })

  it('shows one flight on the timeline, not one per step', () => {
    const model = buildTimelineModel(split())!
    expect(model.links).toHaveLength(1)
    expect(model.pucks[0].spans.filter((s) => s.flight)).toHaveLength(1)
  })

  it('behaves the same after another trip through the flow', () => {
    const once = split()
    const twice = compileFlow(once, drillToFlow(once)!).drill
    const a = buildTimeline(once)
    const b = buildTimeline(twice)
    for (let t = 0; t <= Math.min(a.duration, b.duration); t += 0.05) {
      for (const id of ['F1', 'F2', 'puck']) {
        const [p, q] = [a.at(t)[id], b.at(t)[id]]
        expect(Math.hypot(p[0] - q[0], p[1] - q[1]), `${id} at ${t.toFixed(2)}`).toBeLessThan(0.3)
      }
    }
  })
})

describe('a pass received after being in the air across steps', () => {
  it('lands on the receiver, who picks it up once, at the end', () => {
    const result = editViaFlow(pathDrill(), (f, s) => {
      const from = locateOnPath(f, s, 'F1', [40, 21])!
      const to = locateOnPath(f, s, 'F2', [130, 48])!
      return addPass(f, { puck: 'puck', style: 'pass', from: from.marker, target: { kind: 'marker', marker: to.marker } })
    })!
    expect(result.added).toEqual([])
    expect(validateDrill(result.drill)).toEqual([])
    const moves = result.drill.steps.flatMap((s) => s.moves).filter((m) => m.actor === 'puck')
    expect(moves.filter((m) => m.receiver)).toHaveLength(1)
    expect(moves.at(-1)!.receiver).toBe('F2')
  })

  it('keeps a real bank as a bank, but not the points where steps were cut', () => {
    const flow = drillToFlow(pathDrill())!
    flow.events.push({
      puck: 'puck',
      style: 'pass',
      from: { actor: 'F1', piece: 0, at: 10 },
      target: { kind: 'marker', marker: { actor: 'F2', piece: 0, at: 100 }, via: [[70, 80]] }, // bounces off the boards
    })
    const drill = compileFlow(base, { ...manyStyles(), events: flow.events }).drill
    const back = drillToFlow(drill)!
    expect(back.events[0].target.kind === 'marker' && back.events[0].target.via).toEqual([[70, 80]])
  })
})
