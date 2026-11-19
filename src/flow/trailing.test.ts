import { describe, expect, it } from 'vitest'
import type { Drill } from '../engine/types'
import { editViaFlow } from './apply'
import { compileFlow } from './compile'
import { drillToFlow } from './import'
import { removePass } from './passEdit'

/**
 * A coach feeds the corner, F1 picks it up, skates, and passes to a waiting F2. Reduced from a
 * real drill where deleting that last pass was refused.
 */
const drill = (): Drill => ({
  version: 1,
  id: 'feed',
  title: 'Feed',
  rink: 'half-left',
  actors: [
    { id: 'F1', type: 'forward', start: [79, 37] },
    { id: 'C1', type: 'coach', start: [80, 49] },
    { id: 'puck', type: 'puck', start: [80, 49], carriedBy: 'C1' },
    { id: 'F2', type: 'forward', start: [84, 36] },
  ],
  steps: [
    { moves: [{ actor: 'F1', style: 'skate', points: [[79, 37], [40, 42], [6, 30]] }, { actor: 'puck', style: 'pass', to: [6.3, 29] }] },
    { moves: [{ actor: 'F1', style: 'skate-puck', points: [[6, 30], [6.3, 29]], picksUp: 'puck' }] },
    { moves: [{ actor: 'F1', style: 'skate-puck', points: [[6.3, 29], [30, 18]] }] },
    { moves: [{ actor: 'F1', style: 'skate-puck', points: [[30, 18], [31, 18.4]] }, { actor: 'puck', style: 'pass', to: [84, 36], receiver: 'F2' }] },
  ],
})

describe('deleting the last pass, which a skater was standing still to receive', () => {
  it('is allowed: the pause left at the end is dropped, not reported', () => {
    const flow = drillToFlow(drill())!
    const last = flow.events.length - 1
    expect(flow.events[last].target.kind).toBe('marker')
    const result = editViaFlow(drill(), (f) => removePass(f, last))
    expect(result).not.toBeNull()
    expect(result!.added).toEqual([])
    expect(result!.drill.steps.flatMap((s) => s.moves).some((m) => m.receiver === 'F2')).toBe(false)
  })

  it('still reports a stretch where nobody moves when movement follows it', () => {
    // F1 skates, stands still for 3 s with nobody else moving, then skates again: a real gap.
    const flow = {
      paths: {
        F1: [
          { kind: 'run' as const, style: 'skate' as const, points: [[79, 37], [60, 37]] as [number, number][] },
          { kind: 'wait' as const, seconds: 3 },
          { kind: 'run' as const, style: 'skate' as const, points: [[60, 37], [40, 37]] as [number, number][] },
        ],
      },
      events: [],
    }
    const result = compileFlow(drill(), flow)
    expect(result.problems.map((p) => p.code)).toContain('nobody-moves')
  })

  it('does not report standing still at the very end', () => {
    const flow = {
      paths: {
        F1: [
          { kind: 'run' as const, style: 'skate' as const, points: [[79, 37], [60, 37]] as [number, number][] },
          { kind: 'wait' as const, seconds: 3 },
        ],
      },
      events: [],
    }
    expect(compileFlow(drill(), flow).problems.filter((p) => p.code === 'nobody-moves')).toEqual([])
  })
})
