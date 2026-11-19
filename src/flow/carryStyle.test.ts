import { describe, expect, it } from 'vitest'
import { buildTimeline } from '../engine/timeline'
import type { Drill, Move } from '../engine/types'
import { validateDrill } from '../engine/validate'
import { compileFlow } from './compile'
import { drillToFlow } from './import'
import { positionAtTime, segmentsFor } from './timeline'
import type { Flow } from './types'

const base = (): Drill => ({
  version: 1,
  id: 'carry',
  title: 'Carry',
  rink: 'full',
  actors: [
    { id: 'F1', type: 'forward', start: [50, 20] },
    { id: 'F2', type: 'forward', start: [50, 60] },
    { id: 'puck', type: 'puck', start: [50, 20], carriedBy: 'F1' },
  ],
  steps: [],
})

/** F1 skates with the puck, passes in stride to F2, who skates on and takes it mid-run. */
const flow = (): Flow => ({
  paths: {
    F1: [{ kind: 'run', style: 'skate', points: [[50, 20], [120, 20]] }],
    F2: [{ kind: 'run', style: 'skate', speed: 22.5, points: [[50, 60], [120, 45]] }],
  },
  events: [
    { puck: 'puck', style: 'pass', from: { actor: 'F1', piece: 0, at: 30 }, target: { kind: 'marker', marker: { actor: 'F2', piece: 0, at: 40 } } },
  ],
})

const movesOf = (d: Drill, actor: string): Move[] => d.steps.flatMap((s) => s.moves).filter((m) => m.actor === actor && m.points)

describe('forward skating is with the puck exactly while the skater has it', () => {
  const { drill, problems } = compileFlow(base(), flow())

  it('compiles cleanly', () => {
    expect(problems).toEqual([])
    expect(validateDrill(drill)).toEqual([])
  })

  it('has the passer skate with the puck until the pass leaves, then plain', () => {
    const styles = movesOf(drill, 'F1').map((m) => m.style)
    expect(styles[0]).toBe('skate-puck')
    expect(styles[styles.length - 1]).toBe('skate')
    expect(new Set(styles)).toEqual(new Set(['skate-puck', 'skate']))
  })

  it('has the receiver skate plain until the catch, then with the puck', () => {
    const styles = movesOf(drill, 'F2').map((m) => m.style)
    expect(styles[0]).toBe('skate')
    expect(styles[styles.length - 1]).toBe('skate-puck')
    // It changes once, never back and forth.
    expect(styles.filter((s, i) => i > 0 && s !== styles[i - 1])).toHaveLength(1)
  })

  it('changes nobody\'s timing: they are where the flow says at every moment', () => {
    const f = flow()
    const tl = buildTimeline(drill)
    for (const id of ['F1', 'F2']) {
      const segs = segmentsFor(f.paths[id], id === 'F1' ? [50, 20] : [50, 60])
      for (const t of [0.5, 1, 1.5, 2, 2.5, 3]) {
        const want = positionAtTime(segs, id === 'F1' ? [50, 20] : [50, 60], t)
        expect(Math.hypot(tl.at(t)[id][0] - want[0], tl.at(t)[id][1] - want[1])).toBeLessThan(0.1)
      }
    }
  })

  it('keeps the speed as the run\'s own number, so the symbol does not change how fast', () => {
    // Plain forward skating is 25 ft/s and with the puck 22: a run drawn at 25 must still be 25 with the puck.
    const withPuck = movesOf(drill, 'F1').find((m) => m.style === 'skate-puck')!
    expect(withPuck.speed).toBe(25)
  })
})

describe('a skater who never has the puck', () => {
  it('stays plain skating', () => {
    const f = flow()
    f.events = []
    const { drill } = compileFlow(base(), f)
    expect(movesOf(drill, 'F2').every((m) => m.style === 'skate')).toBe(true)
  })

  it('stays plain when there is no puck at all, whatever the old file said', () => {
    const d = base()
    d.actors = d.actors.filter((a) => a.type !== 'puck')
    const f = flow()
    f.events = []
    expect(movesOf(compileFlow(d, f).drill, 'F1').every((m) => m.style === 'skate')).toBe(true)
  })
})

describe('reading a drill that says skate-puck', () => {
  const written = (): Drill => ({
    ...base(),
    steps: [{ moves: [{ actor: 'F1', style: 'skate-puck', points: [[50, 20], [120, 20]] }] }],
  })

  it('becomes plain skating at the same speed, so it lasts as long as before', () => {
    const f = drillToFlow(written())!
    const run = f.paths.F1[0]
    expect(run.kind === 'run' && run.style).toBe('skate')
    expect(run.kind === 'run' && run.speed).toBe(22)
  })

  it('and comes back as skate-puck on saving, since F1 does have the puck', () => {
    const again = compileFlow(base(), drillToFlow(written())!).drill
    expect(movesOf(again, 'F1').map((m) => m.style)).toEqual(['skate-puck'])
    expect(movesOf(again, 'F1')[0].speed).toBeUndefined() // 22 is its default, so it is not written
  })

  it('keeps an explicit speed that was written', () => {
    const d = written()
    d.steps[0].moves[0].speed = 18
    const run = drillToFlow(d)!.paths.F1[0]
    expect(run.kind === 'run' && run.speed).toBe(18)
  })
})
