import { describe, expect, it } from 'vitest'
import { stopAndWait } from '../engine/fixtures'
import { buildTimeline } from '../engine/timeline'
import { validateDrill } from '../engine/validate'
import { editViaFlow } from './apply'
import type { Starts } from './edit'
import { drillToFlow } from './import'
import { appendRun, pathEnd, reanchorRuns, removeRun, setRunLook, setRunPoints } from './pathEdit'
import { segmentsFor } from './timeline'
import type { Flow } from './types'

const starts: Starts = { F1: [0, 0], F2: [0, 50] }

/** F2: a 50 ft run, a 1 s stop, a 30 ft run. A pass lands on F2 60% of the way along the second run. */
const flow = (): Flow => ({
  paths: {
    F1: [{ kind: 'run', style: 'skate-puck', points: [[0, 0], [100, 0]] }],
    F2: [
      { kind: 'run', style: 'skate', points: [[0, 50], [50, 50]] },
      { kind: 'wait', seconds: 1 },
      { kind: 'run', style: 'skate', points: [[50, 50], [80, 50]] },
    ],
  },
  events: [
    { puck: 'puck', style: 'pass', from: { actor: 'F1', piece: 0, at: 40 }, target: { kind: 'marker', marker: { actor: 'F2', piece: 2, at: 18 } } },
  ],
})

describe('pathEnd and reanchorRuns', () => {
  it('finds where a path ends, or where the skater starts if it has none', () => {
    expect(pathEnd(flow(), starts, 'F2')).toEqual([80, 50])
    expect(pathEnd({ paths: {}, events: [] }, starts, 'F1')).toEqual([0, 0])
  })

  it('leaves a path that is already joined up as the same object', () => {
    const f = flow()
    expect(reanchorRuns(f, starts)).toBe(f)
  })

  it('makes each run start where the one before it ended, even across a pause', () => {
    const f = flow()
    f.paths.F2[2] = { kind: 'run', style: 'skate', points: [[1, 1], [80, 50]] }
    const fixed = reanchorRuns(f, starts)
    const run = fixed.paths.F2[2]
    expect(run.kind === 'run' && run.points[0]).toEqual([50, 50])
  })
})

describe('appendRun', () => {
  it('starts the new run where the path ends, whatever first point was given', () => {
    const f = appendRun(flow(), starts, 'F2', 'backward', [[3, 3], [100, 50]])
    const run = f.paths.F2[3]
    expect(run).toMatchObject({ kind: 'run', style: 'backward' })
    expect(run.kind === 'run' && run.points).toEqual([[80, 50], [100, 50]])
  })

  it('gives a skater with no path their first run, from where they start', () => {
    const f = appendRun({ paths: {}, events: [] }, starts, 'F1', 'skate', [[9, 9], [30, 0]])
    expect(f.paths.F1).toHaveLength(1)
    expect(f.paths.F1[0].kind === 'run' && f.paths.F1[0].points[0]).toEqual([0, 0])
  })

  it('keeps points on the ice', () => {
    const f = appendRun(flow(), starts, 'F2', 'skate', [[0, 0], [999, -5]])
    const run = f.paths.F2[3]
    expect(run.kind === 'run' && run.points[1]).toEqual([200, 0])
  })

  it('refuses a release style, an unknown skater, one point, or no distance', () => {
    const f = flow()
    expect(appendRun(f, starts, 'F2', 'pass', [[0, 0], [1, 1]])).toBe(f)
    expect(appendRun(f, starts, 'ghost', 'skate', [[0, 0], [1, 1]])).toBe(f)
    expect(appendRun(f, starts, 'F2', 'skate', [[0, 0]])).toBe(f)
    expect(appendRun(f, starts, 'F2', 'skate', [[80, 50], [80, 50]])).toBe(f)
  })
})

describe('setRunPoints', () => {
  it('reshapes a run but keeps its start where it was', () => {
    const f = setRunPoints(flow(), starts, 'F2', 0, [[7, 7], [30, 70], [50, 50]])
    const run = f.paths.F2[0]
    expect(run.kind === 'run' && run.points).toEqual([[0, 50], [30, 70], [50, 50]])
  })

  it('moves the start of the next run when this one ends somewhere else, across a pause', () => {
    const f = setRunPoints(flow(), starts, 'F2', 0, [[0, 50], [60, 40]])
    const next = f.paths.F2[2]
    expect(next.kind === 'run' && next.points[0]).toEqual([60, 40])
  })

  it('keeps a marker the same fraction of the way along when the run gets longer', () => {
    // The pass lands 18 ft along a 30 ft run (60%). Stretch the run to 60 ft.
    const f = setRunPoints(flow(), starts, 'F2', 2, [[50, 50], [110, 50]])
    const target = f.events[0].target
    expect(target.kind === 'marker' && target.marker.at).toBeCloseTo(36) // still 60%
  })

  it('leaves markers on other pieces and other skaters alone', () => {
    const f = setRunPoints(flow(), starts, 'F2', 2, [[50, 50], [110, 50]])
    expect(f.events[0].from).toEqual({ actor: 'F1', piece: 0, at: 40 })
  })

  it('refuses a wait, a missing run, a single point, or a run that goes nowhere', () => {
    const f = flow()
    expect(setRunPoints(f, starts, 'F2', 1, [[0, 0], [1, 1]])).toBe(f)
    expect(setRunPoints(f, starts, 'F2', 9, [[0, 0], [1, 1]])).toBe(f)
    expect(setRunPoints(f, starts, 'F2', 0, [[0, 50]])).toBe(f)
    expect(setRunPoints(f, starts, 'F2', 0, [[0, 50], [0, 50]])).toBe(f)
  })

  it('does not change the flow it was given', () => {
    const f = flow()
    setRunPoints(f, starts, 'F2', 0, [[0, 50], [60, 40]])
    expect(f.paths.F2[0].kind === 'run' && f.paths.F2[0].points).toEqual([[0, 50], [50, 50]])
  })
})

describe('setRunLook', () => {
  it('changes style, speed and smoothing, and clears them', () => {
    let f = setRunLook(flow(), starts, 'F2', 0, { style: 'backward', speed: 12, smooth: true })
    expect(f.paths.F2[0]).toMatchObject({ style: 'backward', speed: 12, smooth: true })
    f = setRunLook(f, starts, 'F2', 0, { speed: null, smooth: false })
    expect('speed' in f.paths.F2[0]).toBe(false)
    expect('smooth' in f.paths.F2[0]).toBe(false)
  })

  it('keeps a marker at the same fraction when smoothing changes the length', () => {
    const f = flow()
    f.paths.F2[2] = { kind: 'run', style: 'skate', points: [[50, 50], [65, 70], [80, 50]] }
    const before = segmentsFor(f.paths.F2, starts.F2)[2].length
    const smoothed = setRunLook(f, starts, 'F2', 2, { smooth: true })
    const after = segmentsFor(smoothed.paths.F2, starts.F2)[2].length
    const target = smoothed.events[0].target
    expect(after).not.toBeCloseTo(before)
    expect(target.kind === 'marker' && target.marker.at / after).toBeCloseTo(18 / before, 3)
  })

  it('refuses a release style, an impossible speed, a wait or a missing run', () => {
    const f = flow()
    expect(setRunLook(f, starts, 'F2', 0, { style: 'pass' })).toBe(f)
    expect(setRunLook(f, starts, 'F2', 0, { speed: 500 })).toBe(f)
    expect(setRunLook(f, starts, 'F2', 1, { speed: 20 })).toBe(f)
    expect(setRunLook(f, starts, 'F2', 9, { speed: 20 })).toBe(f)
  })
})

describe('removeRun', () => {
  it('removes a run and renumbers the markers after it', () => {
    const f = removeRun(flow(), starts, 'F2', 0)
    expect(f.paths.F2.map((p) => p.kind)).toEqual(['wait', 'run'])
    const target = f.events[0].target
    expect(target.kind === 'marker' && target.marker.piece).toBe(1)
  })

  it('re-joins the next run to where the skater now is', () => {
    const f = removeRun(flow(), starts, 'F2', 0)
    const run = f.paths.F2[1]
    expect(run.kind === 'run' && run.points[0]).toEqual([0, 50]) // F2 never moved, so it starts at its start
  })

  it('moves a marker that was inside the deleted run to the instant before it', () => {
    const f = flow()
    f.events[0].target = { kind: 'marker', marker: { actor: 'F2', piece: 0, at: 20 } }
    const removed = removeRun(f, starts, 'F2', 0)
    const target = removed.events[0].target
    expect(target.kind === 'marker' && target.marker).toEqual({ actor: 'F2', piece: 0, at: 0 })
  })

  it('merges two pauses that end up side by side', () => {
    const f = flow()
    f.paths.F2 = [
      { kind: 'wait', seconds: 0.5 },
      { kind: 'run', style: 'skate', points: [[0, 50], [50, 50]] },
      { kind: 'wait', seconds: 1 },
    ]
    f.events[0].target = { kind: 'marker', marker: { actor: 'F2', piece: 2, at: 0.25 } }
    const removed = removeRun(f, starts, 'F2', 1)
    expect(removed.paths.F2).toEqual([{ kind: 'wait', seconds: 1.5 }])
    const target = removed.events[0].target
    expect(target.kind === 'marker' && target.marker).toEqual({ actor: 'F2', piece: 0, at: 0.75 })
  })

  it('does nothing for a wait or a missing piece', () => {
    const f = flow()
    expect(removeRun(f, starts, 'F2', 1)).toBe(f)
    expect(removeRun(f, starts, 'F2', 9)).toBe(f)
  })
})

describe('editing the reported drill\'s paths by way of its flow', () => {
  it('reshaping F1\'s long run keeps the drill valid and the pass landing on F2', () => {
    const flow0 = drillToFlow(stopAndWait)!
    const run = flow0.paths.F1[0]
    expect(run.kind).toBe('run')
    const result = editViaFlow(stopAndWait, (f, s) => {
      const first = f.paths.F1[0]
      if (first.kind !== 'run') return null
      // Pull the middle of F1's walk toward the boards, keeping where it starts and ends.
      return setRunPoints(f, s, 'F1', 0, [first.points[0], [60, 83], first.points[first.points.length - 1]])
    })!
    expect(result.added).toEqual([])
    expect(validateDrill(result.drill)).toEqual([])
  })

  it('appending a run for F2 gives it somewhere to go after the shot, and the drill stays valid', () => {
    const result = editViaFlow(stopAndWait, (f, s) => appendRun(f, s, 'F2', 'skate', [[0, 0], [12, 40]]))!
    expect(result.added).toEqual([])
    expect(validateDrill(result.drill)).toEqual([])
    const end = buildTimeline(result.drill).at(buildTimeline(result.drill).duration).F2
    expect(Math.hypot(end[0] - 12, end[1] - 40)).toBeLessThan(0.5) // F2 finishes where the new run ends
  })

  it('deleting F1\'s only run leaves F1 standing at its start, and the pass now leaves from there', () => {
    const result = editViaFlow(stopAndWait, (f, s) => removeRun(f, s, 'F1', 0))!
    expect(result.added).toEqual([])
    const tl = buildTimeline(result.drill)
    const at = tl.at(tl.duration / 2).F1
    expect(Math.hypot(at[0] - 96.2, at[1] - 80.9)).toBeLessThan(0.01) // never moves
    expect(validateDrill(result.drill)).toEqual([])
  })
})
