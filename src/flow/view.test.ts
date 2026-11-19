import { describe, expect, it } from 'vitest'
import { cycleGiveAndGo, stopAndWait, twoOnOne } from '../engine/fixtures'
import { buildTimelineModel, NO_PUCK_MESSAGE, whyNoPuck } from './view'

describe('the timeline model', () => {
  const model = buildTimelineModel(stopAndWait)!

  it('has a row for each skater, and none for the puck or the pylon', () => {
    expect(model.rows.map((r) => r.actor)).toEqual(['F1', 'F2'])
  })

  it('covers the whole drill', () => {
    expect(model.duration).toBeCloseTo(3.63, 1)
  })

  it('shows F2 standing still in front of the pass as a stop', () => {
    const f2 = model.rows.find((r) => r.actor === 'F2')!
    const waits = f2.pieces.filter((p) => p.kind === 'wait')
    const long = waits.find((w) => w.t1 - w.t0 > 0.3)!
    expect(long.role).toBe('stop')
    expect(long.t1 - long.t0).toBeCloseTo(0.35, 1)
  })

  it('also shows the short pause between F2\'s two runs', () => {
    const f2 = model.rows.find((r) => r.actor === 'F2')!
    expect(f2.pieces.map((p) => p.kind)).toEqual(['run', 'wait', 'run', 'wait'])
  })

  it('follows the puck: carried, in the air, then shot as soon as it lands', () => {
    const puck = model.pucks[0]
    // F2 holds it for no time at all (the shot starts the instant the pass lands), so no span for F2.
    expect(puck.spans.map((s) => s.flight ?? s.carrier)).toEqual(['F1', 'pass', 'shoot'])
  })

  it('shows a skater holding the puck between a pass and the next release', () => {
    const spans = buildTimelineModel(twoOnOne)!.pucks[0].spans
    expect(spans.map((s) => s.flight ?? s.carrier)).toEqual(['F1', 'pass', 'F2', 'shoot'])
  })

  it('marks a shot taken as the puck arrives as chained to the pass before it', () => {
    expect(model.links.map((l) => l.chained)).toEqual([false, true])
    // A hold between the pass and the next release (F2 carries it for a while) is not chained.
    expect(buildTimelineModel(twoOnOne)!.links.map((l) => l.chained)).toEqual([false, false])
  })

  it('joins the pass to the skater it reaches', () => {
    expect(model.links[0]).toMatchObject({ style: 'pass', from: { actor: 'F1' }, to: { actor: 'F2' } })
    expect(model.links[1]).toMatchObject({ style: 'shoot', from: { actor: 'F2' }, to: { actor: null } })
  })

  it('has no stop in a drill built to flow', () => {
    const stops = buildTimelineModel(cycleGiveAndGo)!
      .rows.flatMap((r) => r.pieces)
      .filter((p) => p.role === 'stop' && p.t1 - p.t0 > 0.15)
    expect(stops).toEqual([])
  })
})

describe('what a wait means', () => {
  it('calls a late start a delay, not a stop', () => {
    const backdoor = Object.values(import.meta.glob('../../drills/cycle-give-and-go-backdoor.json', { eager: true, import: 'default' }))[0] as typeof cycleGiveAndGo
    const f3 = buildTimelineModel(backdoor)!.rows.find((r) => r.actor === 'F3')!
    expect(f3.pieces[0]).toMatchObject({ kind: 'wait', role: 'delay' })
  })

  it('calls standing at the very end a rest', () => {
    const rows = buildTimelineModel(twoOnOne)!.rows
    const roles = rows.flatMap((r) => r.pieces).filter((p) => p.kind === 'wait').map((p) => p.role)
    expect(roles).toContain('rest')
  })
})

describe('the steps and names', () => {
  it('marks where each step begins, with its name', () => {
    const steps = buildTimelineModel(twoOnOne)!.steps
    expect(steps.map((s) => s.name)).toEqual(['Attack', 'Pass', 'Walk in', 'Shot'])
    expect(steps[0].start).toBe(0)
  })

  it('refuses a drill it cannot read', () => {
    const broken = { ...stopAndWait, steps: [{ moves: [{ actor: 'ghost', style: 'skate' as const, points: [[0, 0], [1, 1]] as [number, number][] }] }] }
    expect(buildTimelineModel(broken)).toBeNull()
  })
})

describe('why a skater has no puck', () => {
  const userLike = () => ({ ...stopAndWait, actors: stopAndWait.actors.filter((a) => a.type !== 'puck'), steps: stopAndWait.steps.filter((s) => s.moves.every((m) => m.actor !== 'puck')) })

  it('says there is no puck at all, and that a line style does not make one', () => {
    const d = userLike()
    const msg = whyNoPuck(d, buildTimelineModel(d)!, 'F1', 1)
    expect(msg).toBe(NO_PUCK_MESSAGE)
    expect(msg).toContain('no puck yet')
  })

  it('says who does have it, when someone else does', () => {
    const model = buildTimelineModel(twoOnOne)!
    expect(whyNoPuck(twoOnOne, model, 'F2', 1)).toContain('F1 does')
  })

  it('says it is in the air during a pass', () => {
    const model = buildTimelineModel(stopAndWait)!
    expect(whyNoPuck(stopAndWait, model, 'F2', 3.0)).toContain('in the air')
  })

  it('says to give a loose puck a carrier when it was never carried', () => {
    const d = { ...userLike(), actors: [...userLike().actors, { id: 'puck', type: 'puck' as const, start: [30, 30] as [number, number] }] }
    const msg = whyNoPuck(d, buildTimelineModel(d)!, 'F1', 1)
    expect(msg).toContain('Carried by')
    expect(msg).toContain('F1')
  })
})
