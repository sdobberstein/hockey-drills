import { describe, expect, it } from 'vitest'
import { buildTimeline } from '../engine/timeline'
import type { Drill } from '../engine/types'
import { validateDrill } from '../engine/validate'
import { compileFlow } from './compile'
import { setRunSeconds } from './edit'
import { drillToFlow } from './import'
import type { Flow } from './types'
import { buildTimelineModel, carrierAtTime } from './view'

const CORNER: [number, number] = [190, 5]

/** F1 dumps the puck into the corner and F2 skates in to get it, drawn as a flow. */
const drill = (): Drill => ({
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

const flow = (): Flow => ({
  paths: { F2: [{ kind: 'run', style: 'skate', points: [[120, 60], [185, 20], CORNER] }] },
  events: [{ puck: 'puck', style: 'pass', from: { actor: 'F1', piece: 0, at: 0 }, target: { kind: 'point', at: CORNER } }],
})

/** A marker's `at` is feet along the run, so use the real end of F2's run. */
const withEnd = (): Flow => {
  const f = flow()
  const run = f.paths.F2[0]
  if (run.kind !== 'run') throw new Error('test setup')
  const len = Math.hypot(65, 40) + Math.hypot(5, 15)
  f.pickups = [{ puck: 'puck', marker: { actor: 'F2', piece: 0, at: len } }]
  return f
}

const near = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.1

describe('compiling a pickup', () => {
  const compiled = compileFlow(drill(), withEnd())

  it('compiles without problems and puts picksUp on the move that ends at the puck', () => {
    expect(compiled.problems).toEqual([])
    expect(validateDrill(compiled.drill)).toEqual([])
    const moves = compiled.drill.steps.flatMap((s) => s.moves)
    expect(moves.filter((m) => m.picksUp === 'puck').map((m) => m.actor)).toEqual(['F2'])
  })

  it('plays as a dump-in: the puck waits in the corner and then rides F2', () => {
    const tl = buildTimeline(compiled.drill)
    const model = buildTimelineModel(compiled.drill)!
    expect(near(tl.at(2).puck, CORNER)).toBe(true)
    const end = tl.at(tl.duration)
    expect(near(end.puck, end.F2)).toBe(true)
    expect(carrierAtTime(model, 'puck', tl.duration)).toBe('F2')
    expect(carrierAtTime(model, 'puck', 2)).toBeNull() // loose in between
  })

  it('has a pickup in stride when the run goes on past the puck', () => {
    const f = withEnd()
    f.paths.F2 = [{ kind: 'run', style: 'skate', points: [[120, 60], [185, 20], CORNER, [190, 30]] }]
    const through = compileFlow(drill(), f)
    expect(through.problems).toEqual([])
    expect(through.drill.steps.flatMap((s) => s.moves).filter((m) => m.picksUp)).toHaveLength(1)
  })

  it('says so when the skater is not running at the pickup', () => {
    const f = withEnd()
    f.paths.F2 = [{ kind: 'run', style: 'skate', points: [[120, 60], [185, 20], CORNER] }, { kind: 'wait', seconds: 2 }]
    f.pickups = [{ puck: 'puck', marker: { actor: 'F2', piece: 1, at: 1 } }]
    expect(compileFlow(drill(), f).problems.map((p) => p.code)).toContain('pickup-no-run')
  })
})

describe('importing a pickup (the inverse)', () => {
  const compiled = compileFlow(drill(), withEnd()).drill
  const back = drillToFlow(compiled)!

  it('recovers the pickup, at the end of the run', () => {
    expect(back.pickups).toHaveLength(1)
    expect(back.pickups![0].puck).toBe('puck')
    expect(back.pickups![0].marker.actor).toBe('F2')
  })

  it('round-trips: compiling the import plays the same', () => {
    const again = compileFlow(drill(), back)
    expect(again.problems).toEqual([])
    const a = buildTimeline(compiled)
    const b = buildTimeline(again.drill)
    expect(b.duration).toBeCloseTo(a.duration, 1)
    for (const t of [0, 1, 2, a.duration / 2, a.duration]) {
      for (const id of ['F1', 'F2', 'puck']) expect(near(a.at(t)[id], b.at(t)[id])).toBe(true)
    }
  })

  it('imports a pickup written by hand in a later step', () => {
    const hand: Drill = {
      ...drill(),
      steps: [
        { moves: [{ actor: 'puck', style: 'pass', to: CORNER }] },
        { moves: [{ actor: 'F2', style: 'skate', points: [[120, 60], CORNER], picksUp: 'puck' }] },
      ],
    }
    const f = drillToFlow(hand)!
    expect(f.pickups).toHaveLength(1)
    expect(compileFlow(drill(), f).problems).toEqual([])
  })
})

describe('a pickup follows its run when the run changes', () => {
  it('stays at the end of the run after the run is made slower', () => {
    const f = withEnd()
    const slower = setRunSeconds(f, { F1: [100, 40], F2: [120, 60] }, 'F2', 0, 8)!
    const result = compileFlow(drill(), slower)
    expect(result.problems).toEqual([])
    const tl = buildTimeline(result.drill)
    expect(tl.duration).toBeCloseTo(8, 0)
    const end = tl.at(tl.duration)
    expect(near(end.puck, end.F2)).toBe(true)
  })
})
