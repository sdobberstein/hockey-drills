import { describe, expect, it } from 'vitest'
import { findWaits } from '../editor/waiting'
import { buildTimeline } from '../engine/timeline'
import type { Drill } from '../engine/types'
import { validateDrill } from '../engine/validate'
import { compileFlow } from './compile'
import { positionAtTime, segmentsFor } from './timeline'
import type { Flow } from './types'

/** Two forwards and a puck carried by F1, with no steps: the flow supplies those. */
const base = (): Drill => ({
  version: 1,
  id: 'flow-test',
  title: 'Flow test',
  rink: 'full',
  actors: [
    { id: 'F1', type: 'forward', start: [50, 20] },
    { id: 'F2', type: 'forward', start: [50, 60] },
    { id: 'puck', type: 'puck', start: [50, 20], carriedBy: 'F1' },
  ],
  steps: [],
})

describe('compiling a flow built by hand', () => {
  /** F1 carries along y=20; F2 runs parallel; F1 passes to F2 while both are moving. */
  const flow = (): Flow => ({
    paths: {
      F1: [{ kind: 'run', style: 'skate-puck', points: [[50, 20], [120, 20]] }],
      // 71.6 ft at 22.5 ft/s lasts as long as F1's 70 ft at 22 ft/s, so both arrive together.
      F2: [{ kind: 'run', style: 'skate', speed: 22.5, points: [[50, 60], [120, 45]] }],
    },
    events: [
      {
        puck: 'puck',
        style: 'pass',
        from: { actor: 'F1', piece: 0, at: 40 },
        target: { kind: 'marker', marker: { actor: 'F2', piece: 0, at: 55 } },
        name: 'Pass in stride',
      },
    ],
  })

  it('compiles to a valid drill with no problems', () => {
    const { drill, problems } = compileFlow(base(), flow())
    expect(problems).toEqual([])
    expect(validateDrill(drill)).toEqual([])
  })

  it('solves the pass speed from the two times, so the receiver is there when it lands', () => {
    const { drill } = compileFlow(base(), flow())
    const pass = drill.steps.flatMap((s) => s.moves).find((m) => m.actor === 'puck')!
    expect(pass.receiver).toBe('F2')
    expect(pass.speed).toBeGreaterThan(20)
    expect(validateDrill(drill)).toEqual([]) // receiver within tolerance when it arrives
  })

  it('has nobody stop to wait: smooth skating by construction', () => {
    const { drill } = compileFlow(base(), flow())
    expect(findWaits(drill, 0.05)).toEqual([])
  })

  it('names the step that starts when the puck leaves', () => {
    const { drill } = compileFlow(base(), flow())
    expect(drill.steps.map((s) => s.name)).toContain('Pass in stride')
  })

  it('moves each skater exactly as their own path says, at every moment', () => {
    const f = flow()
    const { drill } = compileFlow(base(), f)
    const timeline = buildTimeline(drill)
    const f1 = segmentsFor(f.paths.F1, [50, 20])
    const f2 = segmentsFor(f.paths.F2, [50, 60])
    for (let t = 0; t <= timeline.duration; t += 0.05) {
      const at = timeline.at(t)
      const e1 = positionAtTime(f1, [50, 20], t)
      const e2 = positionAtTime(f2, [50, 60], t)
      expect(Math.hypot(at.F1[0] - e1[0], at.F1[1] - e1[1])).toBeLessThan(0.1)
      expect(Math.hypot(at.F2[0] - e2[0], at.F2[1] - e2[1])).toBeLessThan(0.1)
    }
  })

  it('lets a wait be a deliberate choice: F2 starts late, and stays still until then', () => {
    const f = flow()
    f.paths.F2 = [{ kind: 'wait', seconds: 0.5 }, ...f.paths.F2.map((p) => p)]
    f.events[0].target = { kind: 'marker', marker: { actor: 'F2', piece: 1, at: 50 } }
    const { drill, problems } = compileFlow(base(), f)
    expect(problems).toEqual([])
    const tl = buildTimeline(drill)
    expect(tl.at(0.3).F2).toEqual([50, 60]) // still waiting
    expect(tl.at(0.9).F2[0]).toBeGreaterThan(50) // now running
  })
})

describe('a release taken as the puck arrives', () => {
  const chain = (delay?: number): Flow => ({
    paths: {
      F1: [{ kind: 'run', style: 'skate-puck', points: [[50, 20], [120, 20]] }],
      F2: [{ kind: 'run', style: 'skate', speed: 22.5, points: [[50, 60], [120, 45]] }],
    },
    events: [
      { puck: 'puck', style: 'pass', from: { actor: 'F1', piece: 0, at: 40 }, target: { kind: 'marker', marker: { actor: 'F2', piece: 0, at: 55 } } },
      { puck: 'puck', style: 'shoot', from: delay === undefined ? { after: 0 } : { after: 0, delay }, target: { kind: 'point', at: [150, 40] } },
    ],
  })

  it('leaves the moment the pass lands, from where the receiver is', () => {
    const { drill, problems } = compileFlow(base(), chain())
    expect(problems).toEqual([])
    const shot = drill.steps.flatMap((s) => s.moves).find((m) => m.style === 'shoot')!
    expect(shot).toBeDefined()
    expect(validateDrill(drill)).toEqual([])
  })

  it('can hold the puck for a moment first, while someone else is still skating', () => {
    const longer = (delay?: number): Flow => {
      const f = chain(delay)
      f.paths.F1 = [{ kind: 'run', style: 'skate-puck', points: [[50, 20], [160, 20]] }] // F1 keeps going
      return f
    }
    const shotStart = (f: Flow) => buildTimeline(compileFlow(base(), f).drill).plan.steps.find((s) => s.moves.some((m) => m.style === 'shoot'))!.start
    expect(shotStart(longer(0.4)) - shotStart(longer())).toBeCloseTo(0.4, 1)
  })

  it('reports a hold in which nobody moves, since that cannot be a step', () => {
    const f = chain(0.4)
    // The pass lands at the very end of F2's run, when F1 has finished too: then the hold is dead time.
    f.events[0].target = { kind: 'marker', marker: { actor: 'F2', piece: 0, at: 71.5 } }
    expect(compileFlow(base(), f).problems.map((p) => p.code)).toContain('nobody-moves')
  })

  it('reports a chain that points at nothing', () => {
    const f = chain()
    f.events[1].from = { after: 7 }
    expect(compileFlow(base(), f).problems.map((p) => p.code)).toContain('bad-chain')
  })

  it('reports a chain after a pass that nobody receives', () => {
    const f = chain()
    f.events[0].target = { kind: 'point', at: [100, 30] }
    expect(compileFlow(base(), f).problems.map((p) => p.code)).toContain('bad-chain')
  })
})

describe('phases name the steps', () => {
  const flow = (): Flow => ({
    paths: {
      F1: [{ kind: 'run', style: 'skate-puck', points: [[50, 20], [120, 20]] }],
      F2: [{ kind: 'run', style: 'skate', speed: 22.5, points: [[50, 60], [120, 45]] }],
    },
    events: [],
    phases: [
      { start: 0, name: 'Go', notes: 'Both skate.' },
      { start: 1.5, name: 'Halfway' },
    ],
  })

  it('starts a step at each phase and names it', () => {
    const { drill, problems } = compileFlow(base(), flow())
    expect(problems).toEqual([])
    expect(drill.steps.map((s) => s.name)).toEqual(['Go', 'Halfway'])
    expect(drill.steps[0].notes).toBe('Both skate.')
  })

  it('does not change how anyone moves, only where the steps fall', () => {
    const withPhases = buildTimeline(compileFlow(base(), flow()).drill)
    const without = buildTimeline(compileFlow(base(), { ...flow(), phases: undefined }).drill)
    for (let t = 0; t <= withPhases.duration; t += 0.1) {
      expect(withPhases.at(t).F2[0]).toBeCloseTo(without.at(t).F2[0], 1)
    }
  })

  it('ignores a phase that starts after the drill is over', () => {
    const f = flow()
    f.phases!.push({ start: 99, name: 'Never' })
    expect(compileFlow(base(), f).drill.steps.map((s) => s.name)).not.toContain('Never')
  })
})

describe('problems are reported, not hidden', () => {
  const flow = (): Flow => ({
    paths: {
      F1: [{ kind: 'run', style: 'skate-puck', points: [[50, 20], [120, 20]] }],
      F2: [{ kind: 'run', style: 'skate', speed: 22.5, points: [[50, 60], [120, 45]] }],
    },
    events: [
      {
        puck: 'puck',
        style: 'pass',
        from: { actor: 'F1', piece: 0, at: 40 },
        target: { kind: 'marker', marker: { actor: 'F2', piece: 0, at: 55 } },
      },
    ],
  })
  const codes = (f: Flow) => compileFlow(base(), f).problems.map((p) => p.code)

  it('flags a receiver who gets there before the pass leaves', () => {
    const f = flow()
    f.events[0].from = { actor: 'F1', piece: 0, at: 60 }
    f.events[0].target = { kind: 'marker', marker: { actor: 'F2', piece: 0, at: 5 } }
    expect(codes(f)).toContain('receiver-before-release')
  })

  it('flags a pass that would need an impossible speed', () => {
    const f = flow()
    f.events[0].target = { kind: 'marker', marker: { actor: 'F2', piece: 0, at: 41.4 } }
    expect(codes(f)).toContain('pass-speed')
  })

  it('handles something starting while a pass is in the air, by writing the flight across steps', () => {
    const f = flow()
    // F2 changes style in the middle of the flight, which needs a step of its own.
    f.paths.F2 = [
      { kind: 'run', style: 'skate', speed: 22.5, points: [[50, 60], [80, 55]] },
      { kind: 'run', style: 'backward', speed: 22.5, points: [[80, 55], [120, 45]] },
    ]
    f.events[0].target = { kind: 'marker', marker: { actor: 'F2', piece: 1, at: 20 } }
    f.events[0].from = { actor: 'F1', piece: 0, at: 10 }
    const { drill, problems } = compileFlow(base(), f)
    expect(problems).toEqual([])
    const puck = drill.steps.flatMap((s) => s.moves).filter((m) => m.actor === 'puck')
    expect(puck.length).toBeGreaterThan(1) // in the air across more than one step
    expect(puck[0].continues).toBeUndefined() // the release
    expect(puck.slice(1).every((m) => m.continues === true)).toBe(true)
    expect(puck.filter((m) => m.receiver).length).toBe(1) // received once, at the end
    expect(validateDrill(drill)).toEqual([])
  })

  it('flags a pass from or to someone who is not in the drill', () => {
    const f = flow()
    f.events[0].from = { actor: 'ghost', piece: 0, at: 0 }
    expect(codes(f)).toContain('unknown-actor')
  })

  it('flags time in which nobody moves, since there can be no step for it', () => {
    const f: Flow = {
      paths: {
        F1: [{ kind: 'run', style: 'skate', points: [[50, 20], [60, 20]] }, { kind: 'wait', seconds: 2 }],
        F2: [{ kind: 'wait', seconds: 1 }, { kind: 'run', style: 'skate', points: [[50, 60], [60, 60]] }],
      },
      events: [],
    }
    const d = base()
    d.actors = d.actors.filter((a) => a.type !== 'puck')
    expect(compileFlow(d, f).problems.map((p) => p.code)).toContain('nobody-moves')
  })

  it('reports anything the validator would reject in the result', () => {
    // Nobody is carrying the puck, so there is nothing to pass: the compiler does not check that
    // itself, it asks the validator and passes on what it says.
    const d = base()
    d.actors = d.actors.map((a) => (a.id === 'puck' ? { id: 'puck', type: 'puck' as const, start: [50, 20] as [number, number] } : a))
    expect(compileFlow(d, flow()).problems.map((p) => p.code)).toContain('drill-invalid')
  })
})

describe('cutting a smooth run', () => {
  it('keeps the curve exact when another skater\'s change cuts through it', () => {
    const f: Flow = {
      paths: {
        F1: [{ kind: 'run', style: 'skate', smooth: true, points: [[20, 20], [60, 40], [100, 20], [140, 40]] }],
        // F2 starts running 1.5 s in, which forces a boundary through F1's curve.
        F2: [{ kind: 'wait', seconds: 1.5 }, { kind: 'run', style: 'skate', points: [[50, 60], [150, 60]] }],
      },
      events: [],
    }
    const d = base()
    d.actors = [
      { id: 'F1', type: 'forward', start: [20, 20] },
      { id: 'F2', type: 'forward', start: [50, 60] },
    ]
    const { drill, problems } = compileFlow(d, f)
    expect(problems).toEqual([])
    const tl = buildTimeline(drill)
    const f1 = segmentsFor(f.paths.F1, [20, 20])
    for (let t = 0; t <= tl.duration; t += 0.05) {
      const at = tl.at(t).F1
      const want = positionAtTime(f1, [20, 20], t)
      expect(Math.hypot(at[0] - want[0], at[1] - want[1])).toBeLessThan(0.05)
    }
    // It was cut, so the first part is dense points rather than the smooth flag.
    expect(drill.steps.length).toBeGreaterThan(1)
  })
})

describe('a run that a step covers to within the merge tolerance', () => {
  it('keeps its own points and smooth flag, not a dense copy of the curve', () => {
    // F2's run ends 3 ms before F1's smooth run does: the two boundaries merge, and F1's run is still whole.
    const d = base()
    d.actors = [
      { id: 'F1', type: 'forward', start: [20, 20] },
      { id: 'F2', type: 'forward', start: [50, 60] },
    ]
    const smooth: Flow['paths'][string] = [{ kind: 'run', style: 'skate', smooth: true, speed: 25, points: [[20, 20], [60, 40], [100, 20]] }]
    const seconds = segmentsFor(smooth, [20, 20])[0].t1
    const f: Flow = {
      paths: { F1: smooth, F2: [{ kind: 'run', style: 'skate', speed: 25, points: [[50, 60], [50 + (seconds - 0.003) * 25, 60]] }] },
      events: [],
    }
    const move = compileFlow(d, f).drill.steps.flatMap((s) => s.moves).find((m) => m.actor === 'F1')!
    expect(move.smooth).toBe(true)
    expect(move.points).toHaveLength(3)
  })
})

describe('boundaries a few milliseconds either side of a release', () => {
  // F1 carries along y = 20 at 25 ft/s and lets the puck go 40 ft in (1.6 s). F2 finishes its run 4 ms
  // before that and F3 starts running 4 ms after. Each boundary is within the 5 ms merge tolerance of
  // the release, but they are 8 ms apart so they are not merged with each other, and a run that starts
  // is never tidied away. Both used to think they were the step the pass leaves in, so it was let go
  // twice, and the second time nobody had the puck.
  it('release the pass once, in the step nearest it', () => {
    const d = base()
    d.actors = [...d.actors, { id: 'F3', type: 'forward', start: [50, 75] }]
    const f: Flow = {
      paths: {
        F1: [{ kind: 'run', style: 'skate', speed: 25, points: [[50, 20], [120, 20]] }],
        F2: [{ kind: 'run', style: 'skate', speed: 25, points: [[50, 60], [50 + 1.596 * 25, 60]] }],
        F3: [{ kind: 'wait', seconds: 1.604 }, { kind: 'run', style: 'skate', speed: 25, points: [[50, 75], [100, 75]] }],
      },
      events: [{ puck: 'puck', style: 'pass', from: { actor: 'F1', piece: 0, at: 40 }, target: { kind: 'point', at: [100, 40] } }],
    }
    const { drill, problems } = compileFlow(d, f)
    expect(problems).toEqual([])
    expect(validateDrill(drill)).toEqual([])
    const passes = drill.steps.flatMap((s) => s.moves).filter((m) => m.actor === 'puck')
    expect(passes.filter((m) => !m.continues)).toHaveLength(1)
  })
})
