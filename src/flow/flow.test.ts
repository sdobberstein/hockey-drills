import { describe, expect, it } from 'vitest'
import { cycleGiveAndGo, stopAndWait, twoOnOne } from '../engine/fixtures'
import { parseDrill } from '../engine/parse'
import { buildTimeline } from '../engine/timeline'
import type { Drill } from '../engine/types'
import { compileFlow } from './compile'
import { drillToFlow } from './import'

/**
 * The criterion for the whole flow model (PLAN.md): importing a drill into a
 * flow and compiling it back must behave the same as the original, with every
 * actor in the same place at every moment. The puck may differ by up to the
 * receive tolerance, because the original only promised to land within it.
 */
function sameBehaviour(original: Drill, rebuilt: Drill, actorTolerance = 0.25, puckTolerance = 1.5) {
  const a = buildTimeline(original)
  const b = buildTimeline(rebuilt)
  expect(Math.abs(a.duration - b.duration)).toBeLessThan(0.1)
  const end = Math.min(a.duration, b.duration)
  for (let t = 0; t <= end; t += 0.04) {
    const pa = a.at(t)
    const pb = b.at(t)
    for (const id of Object.keys(pa)) {
      const limit = original.actors.find((x) => x.id === id)?.type === 'puck' ? puckTolerance : actorTolerance
      const gap = Math.hypot(pa[id][0] - pb[id][0], pa[id][1] - pb[id][1])
      if (gap > limit) throw new Error(`${original.id}: ${id} differs by ${gap.toFixed(2)} ft at t=${t.toFixed(2)} s`)
    }
  }
}

const library = Object.entries(
  import.meta.glob('../../drills/*.json', { eager: true, import: 'default' }),
) as [string, Drill][]

const roundTrip = (drill: Drill) => {
  const flow = drillToFlow(drill)
  if (!flow) throw new Error(`${drill.id} could not be imported`)
  return { flow, ...compileFlow(drill, flow) }
}

describe('import then compile behaves like the original', () => {
  for (const [path, drill] of library) {
    it(`library drill ${path.split('/').pop()}`, () => {
      const { drill: rebuilt, problems } = roundTrip(drill)
      expect(problems).toEqual([])
      sameBehaviour(drill, rebuilt)
    })
  }

  it('the stop-and-go 2-on-1 test fixture', () => {
    const { drill: rebuilt, problems } = roundTrip(twoOnOne)
    expect(problems).toEqual([])
    sameBehaviour(twoOnOne, rebuilt)
  })

  it('the reported drill where F2 stops and waits', () => {
    const { drill: rebuilt, problems } = roundTrip(stopAndWait)
    expect(problems).toEqual([])
    sameBehaviour(stopAndWait, rebuilt)
  })

  it('keeps every step name and note, in the same order', () => {
    for (const [, drill] of library) {
      const { drill: rebuilt } = roundTrip(drill)
      expect(rebuilt.steps.map((s) => s.name)).toEqual(drill.steps.map((s) => s.name))
      expect(rebuilt.steps.map((s) => s.notes)).toEqual(drill.steps.map((s) => s.notes))
    }
  })

  it('produces a drill that passes full validation, schema included', () => {
    for (const drill of [cycleGiveAndGo, stopAndWait, twoOnOne]) {
      expect(parseDrill(roundTrip(drill).drill).issues).toEqual([])
    }
  })
})
