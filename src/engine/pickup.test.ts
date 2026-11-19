import { describe, expect, it } from 'vitest'
import { parseDrill } from './parse'
import { buildTimeline } from './timeline'
import type { Drill } from './types'
import { validateDrill } from './validate'

const CORNER: [number, number] = [190, 5]

/** F1 dumps the puck into the corner; F2 skates in and collects it. */
const dumpIn = (samestep: boolean): Drill => ({
  version: 1,
  id: 'dump-in',
  title: 'Dump in',
  rink: 'full',
  actors: [
    { id: 'F1', type: 'forward', start: [100, 40] },
    { id: 'F2', type: 'forward', start: [120, 60] },
    { id: 'puck', type: 'puck', start: [100, 40], carriedBy: 'F1' },
  ],
  steps: samestep
    ? [
        {
          moves: [
            { actor: 'puck', style: 'pass', to: CORNER },
            { actor: 'F2', style: 'skate', points: [[120, 60], CORNER], picksUp: 'puck' },
          ],
        },
      ]
    : [
        { moves: [{ actor: 'puck', style: 'pass', to: CORNER }] },
        { moves: [{ actor: 'F2', style: 'skate', points: [[120, 60], CORNER], picksUp: 'puck' }] },
      ],
})

const near = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05

describe('picking up a loose puck (a dump-in, retrieved)', () => {
  for (const samestep of [false, true]) {
    describe(samestep ? 'dump and retrieve in one step' : 'dump, then retrieve in the next step', () => {
      const drill = dumpIn(samestep)
      const tl = buildTimeline(drill)
      const dumped = tl.plan.steps[0].moves.find((m) => m.actor === 'puck')!.duration
      const pickupAt = tl.plan.steps[tl.plan.steps.length - 1].start + tl.plan.steps[tl.plan.steps.length - 1].moves.find((m) => m.actor === 'F2')!.duration

      it('is valid', () => {
        expect(validateDrill(drill)).toEqual([])
      })

      it('lets the puck sit in the corner while nobody has it', () => {
        expect(near(tl.at(dumped + 0.2).puck, CORNER)).toBe(true)
        expect(near(tl.at(pickupAt - 0.3).puck, CORNER)).toBe(true) // F2 is still on the way
        expect(tl.at(pickupAt - 0.3).F2[0]).toBeLessThan(CORNER[0] - 3)
      })

      it('puts it on F2 once F2 arrives, and F2 keeps it', () => {
        const at = tl.at(pickupAt + 0.01)
        expect(near(at.puck, at.F2)).toBe(true)
        expect(tl.plan.steps[tl.plan.steps.length - 1].after.carriers.get('puck')).toBe('F2')
      })
    })
  }

  it('does not care which of the two moves is listed first in the step', () => {
    const d = dumpIn(true)
    d.steps[0].moves.reverse() // the skater's move, then the puck's pass
    expect(validateDrill(d)).toEqual([])
    const tl = buildTimeline(d)
    const end = tl.at(tl.duration)
    expect(near(end.puck, end.F2)).toBe(true)
    expect(tl.plan.steps[0].after.carriers.get('puck')).toBe('F2')
  })

  it('lets the puck be picked up in stride: the skater does not stop at the corner', () => {
    const d = dumpIn(false)
    d.steps[1].moves[0] = { actor: 'F2', style: 'skate', points: [[120, 60], [185, 20], CORNER], picksUp: 'puck' }
    expect(validateDrill(d)).toEqual([])
  })

  it('works through the schema and file parser', () => {
    // Parsing takes the decoded JSON, and a schema that did not know `picksUp` would reject it.
    const result = parseDrill(JSON.parse(JSON.stringify(dumpIn(false))))
    expect(result.issues).toEqual([])
    expect(result.drill?.steps[1].moves[0].picksUp).toBe('puck')
  })
})

describe('what a pickup is not allowed to do', () => {
  const codes = (d: Drill) => validateDrill(d).map((i) => i.code)

  it('refuses a puck that is still in the air when the skater arrives', () => {
    const d = dumpIn(true)
    d.steps[0].moves[0] = { actor: 'puck', style: 'pass', to: CORNER, speed: 5 } // a slow puck
    expect(codes(d)).toEqual(['pickup-not-loose'])
  })

  it('refuses a puck someone is carrying', () => {
    const d = dumpIn(false)
    d.steps.shift() // no dump: F1 still has it
    expect(codes(d)).toEqual(['pickup-not-loose'])
    expect(validateDrill(d)[0].message).toContain('F1 is carrying')
  })

  it('refuses a puck that is passed to someone else in the same step', () => {
    const d = dumpIn(true)
    d.steps[0].moves[0] = { actor: 'puck', style: 'pass', to: CORNER, receiver: 'F1' }
    expect(codes(d)).toContain('pickup-not-loose')
  })

  it('refuses a pickup away from the puck, and says how far', () => {
    const d = dumpIn(false)
    d.steps[1].moves[0] = { actor: 'F2', style: 'skate', points: [[120, 60], [170, 30]], picksUp: 'puck' }
    const issues = validateDrill(d)
    expect(issues.map((i) => i.code)).toEqual(['pickup-misses-puck'])
    expect(issues[0].message).toMatch(/\d+\.\d ft away/)
  })

  it('refuses picking up something that is not a puck', () => {
    const d = dumpIn(false)
    d.steps[1].moves[0] = { actor: 'F2', style: 'skate', points: [[120, 60], CORNER], picksUp: 'F1' }
    expect(codes(d)).toEqual(['unknown-target'])
  })
})
