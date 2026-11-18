import { describe, expect, it } from 'vitest'
import { clone, stopAndWait, twoOnOne } from '../engine/fixtures'
import { drillToFlow } from './import'

describe('importing a drill that stops and starts', () => {
  const flow = drillToFlow(stopAndWait)!

  it('shows the stop as an explicit wait', () => {
    const kinds = flow.paths.F2.map((p) => p.kind)
    expect(kinds).toEqual(['run', 'wait', 'run', 'wait'])
    const wait = flow.paths.F2[3]
    expect(wait.kind === 'wait' && wait.seconds).toBeCloseTo(0.35, 1) // standing for the pass
  })

  it('lands the pass on F2 while F2 is waiting, not after it has moved on', () => {
    const pass = flow.events[0]
    expect(pass.target.kind === 'marker' && pass.target.marker).toMatchObject({ actor: 'F2', piece: 3 })
  })

  it('refuses a drill it cannot plan', () => {
    const broken = clone(stopAndWait)
    broken.steps[0].moves[0].actor = 'ghost'
    expect(drillToFlow(broken)).toBeNull()
  })

  it('joins routes the steps chopped up for sync reasons', () => {
    // F2 skates the same way in two steps with no pause: one run.
    const d = clone(twoOnOne)
    d.steps = [
      { moves: [{ actor: 'F2', style: 'skate', points: [[95, 60], [120, 60]] }] },
      { moves: [{ actor: 'F2', style: 'skate', points: [[120, 60], [150, 60]] }] },
    ]
    const f = drillToFlow(d)!
    expect(f.paths.F2).toHaveLength(1)
    expect(f.paths.F2[0].kind === 'run' && f.paths.F2[0].points).toEqual([[95, 60], [120, 60], [150, 60]])
  })
})
