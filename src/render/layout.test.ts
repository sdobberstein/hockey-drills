import { describe, expect, it } from 'vitest'
import { twoOnOne } from '../engine/fixtures'
import { buildTimeline } from '../engine/timeline'
import { CARRY_OFFSET, displayPosition } from './layout'

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
