import { describe, expect, it } from 'vitest'
import { findWaits } from '../editor/waiting'
import { stopAndWait } from '../engine/fixtures'
import { buildTimeline } from '../engine/timeline'
import { validateDrill } from '../engine/validate'
import { editViaFlow } from './apply'
import { carrierOf, insertWait, moveLanding, moveRelease, removeWait, setRunSeconds, setWaitSeconds, type Starts } from './edit'
import { drillToFlow } from './import'
import { segmentsFor } from './timeline'
import type { Flow } from './types'

const starts: Starts = { F1: [0, 0], F2: [0, 50] }

/** F2: a 50 ft run (2 s at 25), a 0.5 s stop, another 25 ft run (1 s). A pass lands on F2 in the stop and one in the last run. */
const flow = (): Flow => ({
  paths: {
    F1: [{ kind: 'run', style: 'skate-puck', points: [[0, 0], [100, 0]] }],
    F2: [
      { kind: 'run', style: 'skate', points: [[0, 50], [50, 50]] },
      { kind: 'wait', seconds: 0.5 },
      { kind: 'run', style: 'skate', points: [[50, 50], [75, 50]] },
    ],
  },
  events: [
    { puck: 'puck', style: 'pass', from: { actor: 'F1', piece: 0, at: 40 }, target: { kind: 'marker', marker: { actor: 'F2', piece: 1, at: 0.3 } } },
    { puck: 'puck', style: 'pass', from: { actor: 'F2', piece: 2, at: 5 }, target: { kind: 'marker', marker: { actor: 'F1', piece: 0, at: 90 } } },
  ],
})

describe('removeWait', () => {
  it('removes a stop and renumbers the markers after it', () => {
    const f = removeWait(flow(), starts, 'F2', 1)
    expect(f.paths.F2.map((p) => p.kind)).toEqual(['run', 'run'])
    expect(f.events[1].from).toEqual({ actor: 'F2', piece: 1, at: 5 }) // was piece 2
  })

  it('moves a marker that was inside the stop to where the stop began', () => {
    const f = removeWait(flow(), starts, 'F2', 1)
    const target = f.events[0].target
    expect(target.kind === 'marker' && target.marker).toEqual({ actor: 'F2', piece: 0, at: 50 }) // the end of the first run
  })

  it('leaves other actors\' markers alone', () => {
    const f = removeWait(flow(), starts, 'F2', 1)
    expect(f.events[0].from).toEqual({ actor: 'F1', piece: 0, at: 40 })
  })

  it('does nothing for a run or an unknown piece', () => {
    const f = flow()
    expect(removeWait(f, starts, 'F2', 0)).toBe(f)
    expect(removeWait(f, starts, 'F2', 9)).toBe(f)
    expect(removeWait(f, starts, 'ghost', 0)).toBe(f)
  })

  it('does not change the flow it was given', () => {
    const f = flow()
    removeWait(f, starts, 'F2', 1)
    expect(f.paths.F2).toHaveLength(3)
  })
})

describe('setWaitSeconds', () => {
  it('changes how long a stop lasts', () => {
    expect(setWaitSeconds(flow(), starts, 'F2', 1, 1.2).paths.F2[1]).toEqual({ kind: 'wait', seconds: 1.2 })
  })

  it('removes a stop that shrinks to nothing', () => {
    expect(setWaitSeconds(flow(), starts, 'F2', 1, 0.01).paths.F2).toHaveLength(2)
  })

  it('keeps a marker inside a stop that got shorter', () => {
    const f = setWaitSeconds(flow(), starts, 'F2', 1, 0.2)
    const target = f.events[0].target
    expect(target.kind === 'marker' && target.marker.at).toBe(0.2)
  })
})

describe('insertWait', () => {
  it('delays a start, renumbering that actor\'s markers', () => {
    const f = insertWait(flow(), 'F1', 0, 0.8)
    expect(f.paths.F1[0]).toEqual({ kind: 'wait', seconds: 0.8 })
    expect(f.events[0].from).toEqual({ actor: 'F1', piece: 1, at: 40 })
  })

  it('lengthens a neighbouring stop instead of putting two side by side', () => {
    const f = insertWait(flow(), 'F2', 2, 0.25)
    expect(f.paths.F2).toHaveLength(3)
    expect(f.paths.F2[1]).toEqual({ kind: 'wait', seconds: 0.75 })
  })

  it('gives an actor with no path one', () => {
    const f = insertWait({ paths: {}, events: [] }, 'F3', 0, 1)
    expect(f.paths.F3).toEqual([{ kind: 'wait', seconds: 1 }])
  })

  it('ignores a pause too short to be one, or a place that does not exist', () => {
    const f = flow()
    expect(insertWait(f, 'F1', 0, 0.01)).toBe(f)
    expect(insertWait(f, 'F1', 5, 1)).toBe(f)
  })
})

describe('setRunSeconds', () => {
  it('sets the speed from how long the run should last', () => {
    const f = setRunSeconds(flow(), starts, 'F2', 0, 4)!
    expect(f.paths.F2[0]).toMatchObject({ speed: 12.5 }) // 50 ft in 4 s
  })

  it('keeps a marker at the same place on the ice', () => {
    const f = setRunSeconds(flow(), starts, 'F2', 2, 2)!
    expect(f.events[1].from).toEqual({ actor: 'F2', piece: 2, at: 5 })
  })

  it('refuses a speed nobody skates, a wait, or a non-positive time', () => {
    expect(setRunSeconds(flow(), starts, 'F2', 0, 0.1)).toBeNull() // 500 ft/s
    expect(setRunSeconds(flow(), starts, 'F2', 0, 60)).toBeNull() // 0.8 ft/s
    expect(setRunSeconds(flow(), starts, 'F2', 1, 1)).toBeNull() // a wait
    expect(setRunSeconds(flow(), starts, 'F2', 0, 0)).toBeNull()
  })
})

describe('moving a pass\'s ends', () => {
  it('moves where it leaves, to wherever the passer is at that time', () => {
    const f = moveRelease(flow(), starts, 0, 2)
    expect(f.events[0].from).toEqual({ actor: 'F1', piece: 0, at: 2 * 22 }) // skate-puck is 22 ft/s
  })

  it('moves where it lands along the receiver\'s path, across pieces', () => {
    const f = moveLanding(flow(), starts, 0, 2.8)
    const target = f.events[0].target
    expect(target.kind === 'marker' && target.marker).toMatchObject({ actor: 'F2', piece: 2 })
    // and back into the first run
    const g = moveLanding(flow(), starts, 0, 1)
    expect(g.events[0].target.kind === 'marker' && g.events[0].target.marker).toMatchObject({ piece: 0, at: 25 })
  })

  it('keeps a time past the end on the last piece', () => {
    const from = moveRelease(flow(), starts, 0, 99).events[0].from
    expect('piece' in from && from.piece).toBe(0)
    expect('at' in from && from.at).toBeCloseTo(segmentsFor(flow().paths.F1, [0, 0])[0].length)
  })

  it('leaves a pass that lands on a spot alone', () => {
    const f = flow()
    f.events[0].target = { kind: 'point', at: [10, 10] }
    expect(moveLanding(f, starts, 0, 1)).toBe(f)
  })
})

describe('editing the reported drill by way of its flow', () => {
  const stops = (d: typeof stopAndWait) => findWaits(d, 0.15).filter((w) => w.kind === 'early')
  const passOf = (d: typeof stopAndWait) => d.steps.flatMap((s) => s.moves).find((m) => m.actor === 'puck' && m.style === 'pass')!

  it('removing F2\'s stop speeds the pass up so it arrives as F2 finishes', () => {
    const result = editViaFlow(stopAndWait, (f, s) => removeWait(f, s, 'F2', 3))!
    expect(result.added).toEqual([])
    expect(validateDrill(result.drill)).toEqual([])
    expect(stops(result.drill).some((w) => w.actor === 'F2')).toBe(false)
    expect(passOf(result.drill).speed).toBeGreaterThan(60) // it was 42
  })

  it('slowing F2 to meet the pass takes the stop out without touching the pass speed', () => {
    const result = editViaFlow(stopAndWait, (f, s) => {
      const slower = setRunSeconds(f, s, 'F2', 2, 0.92)
      return slower && removeWait(slower, s, 'F2', 3)
    })!
    expect(result.added).toEqual([])
    expect(validateDrill(result.drill)).toEqual([])
    expect(stops(result.drill).some((w) => w.actor === 'F2')).toBe(false)
    // About where it was (42), not the 67 that speeding the pass up would need. It differs a little
    // because the pass now lands exactly where F2 finishes, about a foot from where it was aimed.
    expect(passOf(result.drill).speed).toBeGreaterThan(41)
    expect(passOf(result.drill).speed).toBeLessThan(44)
  })

  it('refuses making F2 start running again while the pass is still in the air', () => {
    const result = editViaFlow(stopAndWait, (f, s) => setWaitSeconds(f, s, 'F2', 1, 0.4))!
    expect(result.added.map((p) => p.code)).toContain('pass-in-flight')
  })

  it('refuses landing the pass before it leaves', () => {
    const result = editViaFlow(stopAndWait, (f, s) => moveLanding(f, s, 0, 0.5))!
    expect(result.added.map((p) => p.code)).toContain('receiver-before-release')
  })

  it('is no change at all when the edit does nothing', () => {
    const result = editViaFlow(stopAndWait, (f) => f)!
    expect(result.added).toEqual([])
    expect(validateDrill(result.drill)).toEqual([])
  })

  it('gives up on a drill it cannot turn into a flow', () => {
    const broken = { ...stopAndWait, steps: [{ moves: [{ actor: 'ghost', style: 'skate' as const, points: [[0, 0], [1, 1]] as [number, number][] }] }] }
    expect(editViaFlow(broken, (f) => f)).toBeNull()
  })

  it('knows the flow it imported has F2 stopping in front of the pass', () => {
    expect(drillToFlow(stopAndWait)!.paths.F2.map((p) => p.kind)).toEqual(['run', 'wait', 'run', 'wait'])
  })
})

describe('a shot taken as the puck arrives follows the pass that fed it', () => {
  const duration = (d: typeof stopAndWait) => buildTimeline(d).duration
  const flowOf = () => drillToFlow(stopAndWait)!

  it('is imported as anchored to the pass, not to a spot on F2\'s path', () => {
    expect(flowOf().events[1].from).toEqual({ after: 0 })
  })

  it('moves with the pass when the pass lands earlier, leaving no dead time', () => {
    const result = editViaFlow(stopAndWait, (f, s) => moveLanding(f, s, 0, 3.2))!
    expect(result.added).toEqual([])
    expect(validateDrill(result.drill)).toEqual([])
    // The whole drill got shorter by about as much as the landing moved.
    expect(duration(result.drill)).toBeLessThan(duration(stopAndWait) - 0.2)
  })

  it('stays anchored to the pass when the pass leaves later', () => {
    const result = editViaFlow(stopAndWait, (f, s) => moveRelease(f, s, 0, 2.7))!
    expect(result.added.map((p) => p.code)).not.toContain('nobody-moves')
  })

  it('becomes anchored to a point on the path once you choose when it leaves', () => {
    const f = moveRelease(flowOf(), { F1: [96.2, 80.9], F2: [96.2, 60.4] }, 1, 3.3)
    expect(f.events[1].from).toMatchObject({ actor: 'F2' })
  })

  it('names who has the puck for an event taken on arrival', () => {
    expect(carrierOf(flowOf(), 1)).toBe('F2')
    expect(carrierOf(flowOf(), 0)).toBe('F1')
    expect(carrierOf(flowOf(), 9)).toBeNull()
  })
})
