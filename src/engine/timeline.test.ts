import { describe, expect, it } from 'vitest'
import { clone, cycleGiveAndGo, twoOnOne } from './fixtures'
import { buildTimeline, headingAt, headingsAt, stepIndexAt } from './timeline'

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

describe('banked pass to a skating receiver (Cycle Give and Go)', () => {
  const tl = buildTimeline(cycleGiveAndGo)
  const bump = tl.plan.steps[1]
  const puckMove = bump.moves.find((m) => m.actor === 'puck')!

  it('sends the puck off the boards on the way', () => {
    // The first leg ends at the boards (y = 84), reached after leg 1 / speed.
    const atBoards = tl.at(bump.start + 9.43 / puckMove.speed).puck
    expect(atBoards[1]).toBeGreaterThan(83)
  })

  it('has F2 skating through, not standing, when the puck lands', () => {
    const before = tl.at(bump.start + puckMove.duration - 0.2).F2
    const after = tl.at(bump.start + puckMove.duration + 0.2).F2
    expect(after[0]).toBeGreaterThan(before[0] + 3)
  })

  it('puts the puck on F2 at the landing spot, then carries it with F2', () => {
    const landed = tl.at(bump.start + puckMove.duration)
    expect(Math.hypot(landed.puck[0] - landed.F2[0], landed.puck[1] - landed.F2[1])).toBeLessThan(0.01)
    const later = tl.at(bump.start + bump.duration)
    expect(later.puck).toEqual(later.F2)
  })

  it('keeps the passer moving while the puck leaves', () => {
    const f1Start = tl.at(bump.start).F1
    const f1Soon = tl.at(bump.start + 0.2).F1
    expect(Math.hypot(f1Soon[0] - f1Start[0], f1Soon[1] - f1Start[1])).toBeGreaterThan(3)
  })
})

describe('headingAt: which way someone is going', () => {
  const tl = buildTimeline(cycleGiveAndGo)

  it('is the direction of travel, as a unit vector', () => {
    const h = headingAt(tl, 'F1', 0.5)!
    expect(Math.hypot(h[0], h[1])).toBeCloseTo(1)
  })

  it('points left for a skater going left (F1 starts at the right-hand boards)', () => {
    expect(headingAt(tl, 'F1', 0.5)![0]).toBeLessThan(-0.8)
  })

  it('keeps the way they were heading once they have stopped', () => {
    const during = headingAt(tl, 'F2', 1.0)! // F2 skates right along the boards early on
    const after = headingAt(tl, 'F2', tl.duration)! // finished long ago
    expect(after[0] * during[0] + after[1] * during[1]).toBeGreaterThan(-1) // a real heading, not null
    expect(Math.hypot(after[0], after[1])).toBeCloseTo(1)
  })

  it('looks ahead for someone who has not started moving yet', () => {
    const d = clone(twoOnOne)
    d.steps = [
      { moves: [{ actor: 'F1', style: 'skate', points: [[95, 25], [140, 25]] }] },
      { moves: [{ actor: 'F2', style: 'skate', points: [[95, 60], [95, 40]] }] }, // F2 waits, then goes up the ice
    ]
    const wait = buildTimeline(d)
    const h = headingAt(wait, 'F2', 0)!
    expect(h[1]).toBeLessThan(-0.9) // toward lower y, the way it will go
  })

  it('is null for someone who never moves, and left out of headingsAt', () => {
    expect(headingAt(tl, 'puck', 0.5)).not.toBeNull() // the puck rides its carrier
    const d = { ...twoOnOne, actors: [...twoOnOne.actors, { id: 'cone', type: 'pylon' as const, start: [1, 1] as [number, number] }] }
    const t2 = buildTimeline(d)
    expect(headingAt(t2, 'cone', 1)).toBeNull()
    expect(Object.keys(headingsAt(t2, ['F1', 'cone'], 1))).toEqual(['F1'])
  })
})
