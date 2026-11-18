import { describe, expect, it } from 'vitest'
import { cycleGiveAndGo, clone } from '../engine/fixtures'
import { buildTimeline } from '../engine/timeline'
import type { Drill } from '../engine/types'
import { validateDrill } from '../engine/validate'
import { findMove } from './releases'
import { findRoute } from './routes'
import { applyPassSpeedFix, continueSkating, extendRoute, findWaits, passSpeedFix } from './waiting'

/**
 * A drill from a real editing session, kept as a regression case: F2 skates,
 * stops dead for a third of a second waiting for the pass, and the shot is
 * taken with both forwards standing still. (The pass speed is the unrounded
 * number the editor used to suggest.)
 */
const reported: Drill = {
  version: 1,
  id: 'reported',
  title: 'Reported drill',
  rink: 'half-left',
  actors: [
    { id: 'F1', type: 'forward', start: [96.2, 80.9] },
    { id: 'F2', type: 'forward', start: [96.2, 60.4] },
    { id: 'pylon', type: 'pylon', start: [58.2, 75.4] },
    { id: 'puck', type: 'puck', start: [96.2, 80.9], carriedBy: 'F1' },
  ],
  steps: [
    {
      moves: [
        { actor: 'F1', style: 'skate-puck', points: [[96.2, 80.9], [61.2, 81.1], [40.9, 74.6]] },
        { actor: 'F2', style: 'skate', points: [[96.2, 60.4], [36.7, 43.6]] },
      ],
    },
    {
      moves: [
        { actor: 'F2', style: 'skate', points: [[36.7, 43.6], [22.9, 39.6]] },
        { actor: 'F1', style: 'skate-puck', points: [[40.9, 74.6], [29.5, 65.9]] },
        { actor: 'puck', style: 'pass', speed: 42.16502433248772, to: [24, 39.9], receiver: 'F2' },
      ],
    },
    { moves: [{ actor: 'puck', style: 'shoot', to: [9.4, 42.1] }] },
  ],
}

describe('findWaits', () => {
  it('finds both forwards standing still before the pass arrives', () => {
    const waits = findWaits(reported)
    expect(waits.map((w) => `${w.step}:${w.actor}`).sort()).toEqual(['1:F1', '1:F2'])
    expect(waits.find((w) => w.actor === 'F2')!.idle).toBeCloseTo(0.34, 1)
    expect(waits.find((w) => w.actor === 'F1')!.idle).toBeCloseTo(0.26, 1)
  })

  it('ignores a pause too short to notice, such as 0.09 s in step 1', () => {
    expect(findWaits(reported).some((w) => w.step === 0)).toBe(false)
    expect(findWaits(reported, 0.05).some((w) => w.step === 0 && w.actor === 'F2')).toBe(true)
  })

  it('does not count the puck as someone standing still', () => {
    expect(findWaits(reported).some((w) => w.actor === 'puck')).toBe(false)
  })

  it('finds nothing in a drill built to flow', () => {
    expect(findWaits(cycleGiveAndGo, 0.2).filter((w) => w.kind === 'early')).toEqual([])
  })
})

describe('passSpeedFix', () => {
  const wait = findWaits(reported).find((w) => w.actor === 'F2')!

  it('suggests a faster pass that arrives as F2 finishes', () => {
    const fix = passSpeedFix(reported, wait)!
    expect(fix.puck).toBe('puck')
    expect(fix.speed).toBeGreaterThan(42.2)
    // 38.6 ft of pass over F2's 0.57 s run: about 67 ft/s.
    expect(fix.speed).toBeGreaterThan(60)
    expect(fix.speed).toBeLessThan(75)
  })

  it('removes the stop for F2 without breaking the drill', () => {
    const fixed = applyPassSpeedFix(reported, 1, passSpeedFix(reported, wait)!)
    expect(validateDrill(fixed)).toEqual([])
    expect(findWaits(fixed).some((w) => w.actor === 'F2')).toBe(false)
  })

  it('offers nothing for someone who is not being passed to', () => {
    const f1 = findWaits(reported).find((w) => w.actor === 'F1')!
    expect(passSpeedFix(reported, f1)).toBeNull()
  })
})

describe('extendRoute', () => {
  it('keeps F2 skating until the step ends', () => {
    const fixed = extendRoute(reported, 1, 'F2')
    const tl = buildTimeline(fixed)
    const f2 = tl.plan.steps[1].moves.find((m) => m.actor === 'F2')!
    // The pass is tied to the end of F2's run, so its speed is re-solved to match.
    expect(tl.plan.steps[1].duration - f2.duration).toBeLessThan(0.05)
  })

  it('carries the route on in the direction F2 was already going', () => {
    const before = findRoute(reported, 1, 'F2')!.points
    const after = findRoute(extendRoute(reported, 1, 'F2'), 1, 'F2')!.points
    const [a, b] = [before[0], before[1]]
    const end = after[after.length - 1]
    expect(end[0]).toBeLessThan(b[0]) // further along the same way
    // same heading: the end is on the line through the old last segment
    const cross = (b[0] - a[0]) * (end[1] - b[1]) - (b[1] - a[1]) * (end[0] - b[0])
    expect(Math.abs(cross)).toBeLessThan(1)
  })

  it('re-times the pass so F2 still meets it, and the drill stays valid', () => {
    const fixed = extendRoute(reported, 1, 'F2')
    expect(validateDrill(fixed)).toEqual([])
    expect(findMove(fixed, 1, 'puck')!.receiver).toBe('F2')
  })

  it('moves where F2 is for later steps, so there is no jump', () => {
    const fixed = extendRoute(reported, 1, 'F2')
    const tl = buildTimeline(fixed)
    for (const step of tl.plan.steps.slice(1)) {
      const a = tl.at(step.start - 1e-4)
      const b = tl.at(step.start + 1e-4)
      for (const id of Object.keys(a)) expect(Math.hypot(a[id][0] - b[id][0], a[id][1] - b[id][1])).toBeLessThan(0.5)
    }
  })

  it('does nothing when there is nothing to extend', () => {
    const d = clone(cycleGiveAndGo)
    expect(extendRoute(d, 0, 'F2')).toBe(d)
    expect(extendRoute(reported, 1, 'ghost')).toBe(reported)
    expect(extendRoute(reported, 9, 'F2')).toBe(reported)
  })
})

describe('a skater who stands through a whole step', () => {
  // Make the shot slow enough that the step is long enough to notice.
  const slowShot = (): Drill => {
    const d = clone(reported)
    d.steps[2].moves[0] = { actor: 'puck', style: 'shoot', speed: 30, to: [9.4, 42.1] }
    return d
  }

  it('is reported for a skater who moved in the step before', () => {
    const still = findWaits(slowShot()).filter((w) => w.kind === 'still')
    expect(still.map((w) => w.actor).sort()).toEqual(['F1', 'F2'])
    expect(still[0].step).toBe(2)
  })

  it('is not reported for a step too short to notice', () => {
    expect(findWaits(reported).some((w) => w.kind === 'still')).toBe(false)
  })

  it('keeps them going the way they were heading', () => {
    const fixed = continueSkating(slowShot(), 2, 'F2')
    const route = findRoute(fixed, 2, 'F2')!
    expect(route.style).toBe('skate-puck') // F2 has the puck by then
    const [a, b] = route.points
    expect(b[0]).toBeLessThan(a[0]) // still heading toward the net, as in step 2
    expect(validateDrill(fixed)).toEqual([])
    expect(findWaits(fixed).some((w) => w.actor === 'F2' && w.kind === 'still')).toBe(false)
  })

  it('does nothing for someone who did not skate before, or in a step with no length', () => {
    const d = slowShot()
    expect(continueSkating(d, 0, 'F2')).toBe(d)
    expect(continueSkating(d, 2, 'puck')).toBe(d)
  })
})
