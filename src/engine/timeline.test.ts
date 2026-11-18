import { describe, expect, it } from 'vitest'
import { twoOnOne } from './fixtures'
import { buildTimeline, stepIndexAt } from './timeline'

const timeline = buildTimeline(twoOnOne)
const [attack, pass, walkIn, shot] = timeline.plan.steps

describe('buildTimeline (2-on-1)', () => {
  it('starts with everyone at their start, and the puck on F1', () => {
    const f = timeline.at(0)
    expect(f.F1).toEqual([95, 25])
    expect(f.F2).toEqual([95, 60])
    expect(f.puck).toEqual(f.F1)
  })

  it('moves a carrier and its puck together', () => {
    const f = timeline.at(attack.duration / 2)
    expect(f.F1[0]).toBeGreaterThan(95)
    expect(f.puck).toEqual(f.F1)
  })

  it('has F1 on its mark at the end of the attack, while the slower F2 arrives last', () => {
    const f = timeline.at(attack.duration)
    expect(f.F1).toEqual([150, 28])
    expect(f.F2).toEqual([155, 58])
    expect(f.D).toEqual([150, 38])
  })

  it('holds a finished actor in place while others in the step are still moving', () => {
    // D finishes its 10.8 ft backward skate long before F2 finishes its 60 ft.
    const f = timeline.at(attack.duration * 0.9)
    expect(f.D).toEqual([150, 38])
  })

  it('flies the puck from F1 toward F2 during the pass', () => {
    const f = timeline.at(pass.start + pass.duration / 2)
    expect(f.puck[1]).toBeGreaterThan(28)
    expect(f.puck[1]).toBeLessThan(58)
  })

  it('has F2 carrying the puck after the pass', () => {
    const f = timeline.at(walkIn.start + walkIn.duration / 2)
    expect(f.puck).toEqual(f.F2)
    expect(f.F2[0]).toBeGreaterThan(155)
  })

  it('ends with the puck at the net', () => {
    expect(timeline.at(timeline.duration).puck).toEqual([189, 42])
    expect(timeline.at(shot.start + shot.duration).puck).toEqual([189, 42])
  })

  it('clamps times outside the drill', () => {
    expect(timeline.at(-5)).toEqual(timeline.at(0))
    expect(timeline.at(9999)).toEqual(timeline.at(timeline.duration))
  })

  it('is continuous across a step boundary', () => {
    const before = timeline.at(pass.start - 1e-6)
    const after = timeline.at(pass.start + 1e-6)
    for (const id of Object.keys(before)) {
      expect(after[id][0]).toBeCloseTo(before[id][0], 3)
      expect(after[id][1]).toBeCloseTo(before[id][1], 3)
    }
  })

  it('reports which step is in progress', () => {
    expect(stepIndexAt(timeline.plan, 0)).toBe(0)
    expect(stepIndexAt(timeline.plan, pass.start)).toBe(1)
    expect(stepIndexAt(timeline.plan, walkIn.start + 0.01)).toBe(2)
    expect(stepIndexAt(timeline.plan, timeline.duration)).toBe(3)
  })
})
