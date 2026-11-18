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

describe('planDrill with a smoothed path', () => {
  const corner = {
    ...twoOnOne,
    steps: [
      {
        moves: [{ actor: 'F2', style: 'skate' as const, speed: 10, points: [[95, 60], [115, 60], [115, 40]] as [number, number][] }],
      },
    ],
  }
  const smooth = { ...corner, steps: [{ moves: [{ ...corner.steps[0].moves[0], smooth: true }] }] }

  it('keeps the author\'s waypoints as the ends of the path', () => {
    const path = planDrill(smooth).steps[0].moves[0].path
    expect(path[0]).toEqual([95, 60])
    expect(path[path.length - 1]).toEqual([115, 40])
  })

  it('takes a little longer along the curve than along the chords', () => {
    expect(planDrill(corner).steps[0].duration).toBeCloseTo(4)
    expect(planDrill(smooth).steps[0].duration).toBeGreaterThan(4)
  })

  it('does not change a straight move that names a target', () => {
    const toMove = { ...corner, steps: [{ moves: [{ actor: 'puck', style: 'shoot' as const, to: [189, 42] as [number, number], smooth: true }] }] }
    expect(planDrill(toMove).steps[0].moves[0].path).toHaveLength(2)
  })
})
