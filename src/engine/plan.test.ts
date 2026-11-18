import { describe, expect, it } from 'vitest'
import { twoOnOne } from './fixtures'
import { planDrill } from './plan'

const len = (a: readonly [number, number], b: readonly [number, number]) =>
  Math.hypot(b[0] - a[0], b[1] - a[1])

describe('planDrill (2-on-1)', () => {
  const plan = planDrill(twoOnOne)

  it('makes one planned step per step, keeping its name', () => {
    expect(plan.steps.map((s) => s.name)).toEqual(['Attack', 'Pass', 'Walk in', 'Shot'])
  })

  it('lasts as long as the slowest move in each step', () => {
    // F2 has the longest route in "Attack": 60 ft at 25 ft/s.
    expect(plan.steps[0].duration).toBeCloseTo(len([95, 60], [155, 58]) / 25)
  })

  it('starts each step when the previous one ends', () => {
    expect(plan.steps[1].start).toBeCloseTo(plan.steps[0].duration)
    expect(plan.duration).toBeCloseTo(plan.steps.reduce((sum, s) => sum + s.duration, 0))
  })

  it('reads a pass target actor from the start of its step', () => {
    // The puck leaves F1's end spot and heads for where F2 already is.
    const pass = plan.steps[1].moves[0]
    expect(pass.path).toEqual([[150, 28], [155, 58]])
    expect(pass.receiver).toBe('F2')
  })

  it('hands the puck to the receiver after a pass, and frees it after a shot', () => {
    expect(plan.steps[0].before.carriers.get('puck')).toBe('F1')
    expect(plan.steps[1].after.carriers.get('puck')).toBe('F2')
    expect(plan.steps[3].after.carriers.has('puck')).toBe(false)
  })

  it('puts a carried puck on its carrier regardless of its own start', () => {
    expect(plan.steps[0].before.positions.get('puck')).toEqual([95, 25])
  })
})
