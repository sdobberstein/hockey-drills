import { describe, expect, it } from 'vitest'
import { stopAndWait, twoOnOne } from '../engine/fixtures'
import type { Drill } from '../engine/types'
import { validateDrill } from '../engine/validate'
import { editViaFlow } from './apply'
import { compileFlow } from './compile'
import type { Starts } from './edit'
import { drillToFlow } from './import'
import { addPass, endMarker, followers, locateOnPath, removePass, setPassSpeed, setPassStyle } from './passEdit'
import { buildTimelineModel, carrierAtTime, puckCarriedBy } from './view'
import type { Flow } from './types'

const starts: Starts = { F1: [0, 0], F2: [0, 50] }

const flow = (): Flow => ({
  paths: {
    F1: [{ kind: 'run', style: 'skate-puck', points: [[0, 0], [100, 0]] }],
    F2: [
      { kind: 'run', style: 'skate', points: [[0, 50], [50, 50]] },
      { kind: 'wait', seconds: 1 },
    ],
  },
  events: [],
})

describe('locateOnPath', () => {
  it('turns a click near a run into a marker, and says when the skater is there', () => {
    const hit = locateOnPath(flow(), starts, 'F1', [44, 3])!
    expect(hit.marker).toMatchObject({ actor: 'F1', piece: 0 })
    expect(hit.marker.at).toBeCloseTo(44)
    expect(hit.time).toBeCloseTo(2) // 44 ft at 22 ft/s
    expect(hit.distance).toBeCloseTo(3)
  })

  it('picks the nearest of several runs', () => {
    const f = flow()
    f.paths.F1 = [
      { kind: 'run', style: 'skate', points: [[0, 0], [50, 0]] },
      { kind: 'run', style: 'backward', points: [[50, 0], [50, 40]] },
    ]
    const hit = locateOnPath(f, starts, 'F1', [52, 30])!
    expect(hit.marker.piece).toBe(1)
    expect(hit.marker.at).toBeCloseTo(30)
  })

  it('ignores a wait, and gives null for a skater with no runs', () => {
    expect(locateOnPath({ paths: { F2: [{ kind: 'wait', seconds: 2 }] }, events: [] }, starts, 'F2', [0, 50])).toBeNull()
    expect(locateOnPath(flow(), starts, 'nobody', [0, 0])).toBeNull()
  })
})

describe('endMarker', () => {
  it('is the very end of the path, even if it ends in a wait', () => {
    const end = endMarker(flow(), starts, 'F2')!
    expect(end.marker).toEqual({ actor: 'F2', piece: 1, at: 1 })
    expect(end.time).toBeCloseTo(2 + 1) // a 2 s run then a 1 s wait
  })

  it('is null for a skater with no path', () => {
    expect(endMarker(flow(), starts, 'F3')).toBeNull()
  })
})

describe('addPass, setPassStyle, setPassSpeed', () => {
  const pass = { puck: 'puck', style: 'pass' as const, from: { actor: 'F1', piece: 0, at: 40 }, target: { kind: 'point' as const, at: [60, 20] as [number, number] } }

  it('adds an event, and the original flow is untouched', () => {
    const f = flow()
    const next = addPass(f, pass)
    expect(next.events).toHaveLength(1)
    expect(f.events).toHaveLength(0)
  })

  it('refuses a style that is not a release', () => {
    const f = flow()
    expect(addPass(f, { ...pass, style: 'skate' })).toBe(f)
  })

  it('keeps a speed for a pass to a spot, and drops it for a pass whose speed is solved', () => {
    expect(addPass(flow(), { ...pass, speed: 55 }).events[0].speed).toBe(55)
    const solved = addPass(flow(), { ...pass, target: { kind: 'marker', marker: { actor: 'F2', piece: 0, at: 30 } }, speed: 55 })
    expect(solved.events[0].speed).toBeUndefined()
  })

  it('changes style, and sets or clears a speed', () => {
    const f = addPass(flow(), pass)
    expect(setPassStyle(f, 0, 'shoot').events[0].style).toBe('shoot')
    expect(setPassStyle(f, 0, 'skate')).toBe(f)
    expect(setPassSpeed(f, 0, 70).events[0].speed).toBe(70)
    expect('speed' in setPassSpeed(setPassSpeed(f, 0, 70), 0, null).events[0]).toBe(false)
    expect(setPassSpeed(f, 0, 0)).toBe(f)
    expect(setPassSpeed(f, 9, 30)).toBe(f)
  })
})

describe('removePass', () => {
  const chained = (): Flow => ({
    ...flow(),
    events: [
      { puck: 'puck', style: 'pass', from: { actor: 'F1', piece: 0, at: 20 }, target: { kind: 'marker', marker: { actor: 'F2', piece: 0, at: 40 } } },
      { puck: 'puck', style: 'shoot', from: { after: 0 }, target: { kind: 'point', at: [90, 50] } },
      { puck: 'puck', style: 'pass', from: { actor: 'F2', piece: 1, at: 0.5 }, target: { kind: 'point', at: [10, 10] } },
      { puck: 'puck', style: 'shoot', from: { after: 2 }, target: { kind: 'point', at: [1, 1] } },
    ],
  })

  it('finds what is anchored to a landing', () => {
    expect(followers(chained(), 0)).toEqual([1])
    expect(followers(chained(), 1)).toEqual([])
  })

  it('refuses to strand a shot that was taken as the puck arrived', () => {
    expect(removePass(chained(), 0)).toBeNull()
  })

  it('removes a pass with nothing anchored to it, and renumbers later chains', () => {
    const f = removePass(chained(), 1)!
    expect(f.events).toHaveLength(3)
    expect(f.events[2].from).toEqual({ after: 1 }) // was after: 2
  })

  it('does not renumber a chain that points earlier than the removed event', () => {
    const f = removePass(chained(), 3)!
    expect(f.events[1].from).toEqual({ after: 0 })
  })
})

describe('who has the puck', () => {
  const model = buildTimelineModel(stopAndWait)!

  it('says who carries it at a moment', () => {
    expect(carrierAtTime(model, 'puck', 1)).toBe('F1')
  })

  it('says nobody while it is in the air or after it is loose', () => {
    expect(carrierAtTime(model, 'puck', 3.0)).toBeNull() // the first pass is in the air
    expect(carrierAtTime(model, 'puck', 3.55)).toBeNull() // the shot is in the air
  })

  it('counts a moment a couple of milliseconds before it is received as already carried', () => {
    // In this drill F2 receives the puck and walks in with it before shooting.
    const walk = buildTimelineModel(twoOnOne)!
    const received = walk.pucks[0].spans.find((s) => s.carrier === 'F2')!.t0
    expect(carrierAtTime(walk, 'puck', received - 0.002)).toBe('F2') // a click meant for that instant, slightly early
    expect(carrierAtTime(walk, 'puck', received - 0.3)).toBeNull() // but not well before it
    expect(carrierAtTime(walk, 'puck', received - 0.002, 0)).toBeNull() // and not with no slack
  })

  it('names the puck a skater is carrying, or null', () => {
    expect(puckCarriedBy(model, 'F1', 1)).toBe('puck')
    expect(puckCarriedBy(model, 'F2', 1)).toBeNull()
    expect(puckCarriedBy(model, 'ghost', 1)).toBeNull()
  })
})

describe('linking a pass in a flow, then compiling', () => {
  /** Two forwards skating in parallel, nothing passed yet. */
  const base = (): Drill => ({
    version: 1,
    id: 'link',
    title: 'Link',
    rink: 'full',
    actors: [
      { id: 'F1', type: 'forward', start: [20, 20] },
      { id: 'F2', type: 'forward', start: [20, 60] },
      { id: 'puck', type: 'puck', start: [20, 20], carriedBy: 'F1' },
    ],
    steps: [],
  })
  const drillWithPaths = () =>
    compileFlow(base(), {
      paths: {
        F1: [{ kind: 'run', style: 'skate-puck', points: [[20, 20], [140, 20]] }],
        F2: [{ kind: 'run', style: 'skate', speed: 22, points: [[20, 60], [140, 50]] }],
      },
      events: [],
    }).drill

  it('a pass from a point on one path to a point on another is valid, with its speed solved', () => {
    const result = editViaFlow(drillWithPaths(), (f, s) => {
      const from = locateOnPath(f, s, 'F1', [70, 20])!
      const to = locateOnPath(f, s, 'F2', [100, 53])!
      return addPass(f, { puck: 'puck', style: 'pass', from: from.marker, target: { kind: 'marker', marker: to.marker } })
    })!
    expect(result.added).toEqual([])
    expect(validateDrill(result.drill)).toEqual([])
    const pass = result.drill.steps.flatMap((x) => x.moves).find((m) => m.style === 'pass')!
    expect(pass.receiver).toBe('F2')
    expect(pass.speed).toBeGreaterThan(20)
  })

  it('refuses a pass that would land before it leaves, with the reason', () => {
    const result = editViaFlow(drillWithPaths(), (f, s) => {
      const from = locateOnPath(f, s, 'F1', [100, 20])!
      const to = locateOnPath(f, s, 'F2', [40, 58])!
      return addPass(f, { puck: 'puck', style: 'pass', from: from.marker, target: { kind: 'marker', marker: to.marker } })
    })!
    expect(result.added.map((p) => p.code)).toContain('receiver-before-release')
  })

  it('a shot to a spot works too, with the default shot speed', () => {
    const result = editViaFlow(drillWithPaths(), (f, s) => {
      const from = locateOnPath(f, s, 'F1', [130, 20])!
      return addPass(f, { puck: 'puck', style: 'shoot', from: from.marker, target: { kind: 'point', at: [190, 42] } })
    })!
    expect(result.added).toEqual([])
    expect(validateDrill(result.drill)).toEqual([])
  })

  it('imports a drill with a pass, so it can be removed again', () => {
    const withPass = editViaFlow(drillWithPaths(), (f, s) => {
      const from = locateOnPath(f, s, 'F1', [70, 20])!
      const to = locateOnPath(f, s, 'F2', [100, 53])!
      return addPass(f, { puck: 'puck', style: 'pass', from: from.marker, target: { kind: 'marker', marker: to.marker } })
    })!.drill
    const removed = editViaFlow(withPass, (f) => removePass(f, 0))!
    expect(removed.drill.steps.flatMap((x) => x.moves).some((m) => m.style === 'pass')).toBe(false)
    expect(drillToFlow(removed.drill)!.events).toHaveLength(0)
  })
})
