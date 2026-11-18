import { describe, expect, it } from 'vitest'
import { cycleGiveAndGo, twoOnOne } from '../engine/fixtures'
import { buildTimeline, headingsAt } from '../engine/timeline'
import { CARRY_DISTANCE, CARRY_OFFSET, displayPosition } from './layout'

const timeline = buildTimeline(twoOnOne)
const puck = twoOnOne.actors.find((a) => a.id === 'puck')!
const f1 = twoOnOne.actors.find((a) => a.id === 'F1')!

describe('displayPosition', () => {
  it('leaves players where the engine puts them', () => {
    expect(displayPosition(f1, timeline.at(0), twoOnOne.actors)).toEqual([95, 25])
  })

  it('nudges a carried puck beside its carrier', () => {
    const [x, y] = displayPosition(puck, timeline.at(0), twoOnOne.actors)
    expect([x, y]).toEqual([95 + CARRY_OFFSET[0], 25 + CARRY_OFFSET[1]])
  })

  it('draws a loose puck exactly where it is', () => {
    expect(displayPosition(puck, timeline.at(timeline.duration), twoOnOne.actors)).toEqual([189, 42])
  })
})

describe('the puck goes out in front of the player', () => {
  const tl = buildTimeline(cycleGiveAndGo)
  const actors = cycleGiveAndGo.actors
  const puck = actors.find((a) => a.type === 'puck')!
  const ids = actors.filter((a) => a.type !== 'puck').map((a) => a.id)

  it('is ahead of a skater going left, not behind them', () => {
    const frame = tl.at(0.5)
    const headings = headingsAt(tl, ids, 0.5)
    const f1 = frame.F1
    const [px, py] = displayPosition(puck, frame, actors, headings)
    expect(px).toBeLessThan(f1[0]) // F1 is heading left, so the puck is to its left
    expect(Math.hypot(px - f1[0], py - f1[1])).toBeCloseTo(CARRY_DISTANCE)
  })

  it('is exactly along the heading', () => {
    const frame = tl.at(0.5)
    const headings = headingsAt(tl, ids, 0.5)
    const [px, py] = displayPosition(puck, frame, actors, headings)
    const h = headings.F1
    expect((px - frame.F1[0]) * h[0] + (py - frame.F1[1]) * h[1]).toBeCloseTo(CARRY_DISTANCE)
  })

  it('swings round when the skater turns', () => {
    const early = displayPosition(puck, tl.at(0.5), actors, headingsAt(tl, ids, 0.5))
    const carrierEarly = tl.at(0.5).F1
    const later = displayPosition(puck, tl.at(2.0), actors, headingsAt(tl, ids, 2.0))
    const carrierLater = tl.at(2.0).F1
    const a = [early[0] - carrierEarly[0], early[1] - carrierEarly[1]]
    const b = [later[0] - carrierLater[0], later[1] - carrierLater[1]]
    expect(a[0] * b[0] + a[1] * b[1]).toBeLessThan(CARRY_DISTANCE ** 2 * 0.99) // not the same side any more
  })

  it('falls back to the old side offset when there is no heading', () => {
    const frame = tl.at(0.5)
    expect(displayPosition(puck, frame, actors)).toEqual([frame.F1[0] + CARRY_OFFSET[0], frame.F1[1] + CARRY_OFFSET[1]])
    expect(displayPosition(puck, frame, actors, {})).toEqual([frame.F1[0] + CARRY_OFFSET[0], frame.F1[1] + CARRY_OFFSET[1]])
  })

  it('leaves a loose puck exactly where it is', () => {
    const end = tl.at(tl.duration)
    expect(displayPosition(puck, end, actors, headingsAt(tl, ids, tl.duration))).toEqual(end.puck)
  })
})
