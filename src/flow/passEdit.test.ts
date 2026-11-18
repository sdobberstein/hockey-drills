import { describe, expect, it } from 'vitest'
import { stopAndWait, twoOnOne } from '../engine/fixtures'
import { buildTimeline } from '../engine/timeline'
import type { Drill } from '../engine/types'
import { validateDrill } from '../engine/validate'
import { editViaFlow } from './apply'
import { compileFlow } from './compile'
import type { Starts } from './edit'
import { drillToFlow } from './import'
import { appendRun } from './pathEdit'
import { addPass, believable, endMarker, explain, followers, landingZones, locateOnPath, removePass, setPassSpeed, setPassStyle, snapToLanding } from './passEdit'
import { segmentsFor } from './timeline'
import { buildTimelineModel, carrierAtTime, firstPossession, puckCarriedBy } from './view'
import type { Flow } from './types'
import { pointAlong } from '../engine/geometry'

const starts: Starts = { F1: [0, 0], F2: [0, 50] }

const flow = (): Flow => ({
  paths: {
    F1: [{ kind: 'run', style: 'skate-puck', points: [[0, 0], [100, 0]] }],
    F2: [
      { kind: 'run', style: 'skate', points: [[0, 50], [50, 50]] },
      { kind: 'wait', seconds: 1 },
    ],
  },
  events: [],
})

describe('locateOnPath', () => {
  it('turns a click near a run into a marker, and says when the skater is there', () => {
    const hit = locateOnPath(flow(), starts, 'F1', [44, 3])!
    expect(hit.marker).toMatchObject({ actor: 'F1', piece: 0 })
    expect(hit.marker.at).toBeCloseTo(44)
    expect(hit.time).toBeCloseTo(2) // 44 ft at 22 ft/s
    expect(hit.distance).toBeCloseTo(3)
  })

  it('picks the nearest of several runs', () => {
    const f = flow()
    f.paths.F1 = [
      { kind: 'run', style: 'skate', points: [[0, 0], [50, 0]] },
      { kind: 'run', style: 'backward', points: [[50, 0], [50, 40]] },
    ]
    const hit = locateOnPath(f, starts, 'F1', [52, 30])!
    expect(hit.marker.piece).toBe(1)
    expect(hit.marker.at).toBeCloseTo(30)
  })

  it('ignores a wait, and gives null for a skater with no runs', () => {
    expect(locateOnPath({ paths: { F2: [{ kind: 'wait', seconds: 2 }] }, events: [] }, starts, 'F2', [0, 50])).toBeNull()
    expect(locateOnPath(flow(), starts, 'nobody', [0, 0])).toBeNull()
  })
})

describe('endMarker', () => {
  it('is the very end of the path, even if it ends in a wait', () => {
    const end = endMarker(flow(), starts, 'F2')!
    expect(end.marker).toEqual({ actor: 'F2', piece: 1, at: 1 })
    expect(end.time).toBeCloseTo(2 + 1) // a 2 s run then a 1 s wait
  })

  it('is null for a skater with no path', () => {
    expect(endMarker(flow(), starts, 'F3')).toBeNull()
  })
})

describe('addPass, setPassStyle, setPassSpeed', () => {
  const pass = { puck: 'puck', style: 'pass' as const, from: { actor: 'F1', piece: 0, at: 40 }, target: { kind: 'point' as const, at: [60, 20] as [number, number] } }

  it('adds an event, and the original flow is untouched', () => {
    const f = flow()
    const next = addPass(f, pass)
    expect(next.events).toHaveLength(1)
    expect(f.events).toHaveLength(0)
  })

  it('refuses a style that is not a release', () => {
    const f = flow()
    expect(addPass(f, { ...pass, style: 'skate' })).toBe(f)
  })

  it('keeps a speed for a pass to a spot, and drops it for a pass whose speed is solved', () => {
    expect(addPass(flow(), { ...pass, speed: 55 }).events[0].speed).toBe(55)
    const solved = addPass(flow(), { ...pass, target: { kind: 'marker', marker: { actor: 'F2', piece: 0, at: 30 } }, speed: 55 })
    expect(solved.events[0].speed).toBeUndefined()
  })

  it('changes style, and sets or clears a speed', () => {
    const f = addPass(flow(), pass)
    expect(setPassStyle(f, 0, 'shoot').events[0].style).toBe('shoot')
    expect(setPassStyle(f, 0, 'skate')).toBe(f)
    expect(setPassSpeed(f, 0, 70).events[0].speed).toBe(70)
    expect('speed' in setPassSpeed(setPassSpeed(f, 0, 70), 0, null).events[0]).toBe(false)
    expect(setPassSpeed(f, 0, 0)).toBe(f)
    expect(setPassSpeed(f, 9, 30)).toBe(f)
  })
})

describe('removePass', () => {
  const chained = (): Flow => ({
    ...flow(),
    events: [
      { puck: 'puck', style: 'pass', from: { actor: 'F1', piece: 0, at: 20 }, target: { kind: 'marker', marker: { actor: 'F2', piece: 0, at: 40 } } },
      { puck: 'puck', style: 'shoot', from: { after: 0 }, target: { kind: 'point', at: [90, 50] } },
      { puck: 'puck', style: 'pass', from: { actor: 'F2', piece: 1, at: 0.5 }, target: { kind: 'point', at: [10, 10] } },
      { puck: 'puck', style: 'shoot', from: { after: 2 }, target: { kind: 'point', at: [1, 1] } },
    ],
  })

  it('finds what is anchored to a landing', () => {
    expect(followers(chained(), 0)).toEqual([1])
    expect(followers(chained(), 1)).toEqual([])
  })

  it('refuses to strand a shot that was taken as the puck arrived', () => {
    expect(removePass(chained(), 0)).toBeNull()
  })

  it('removes a pass with nothing anchored to it, and renumbers later chains', () => {
    const f = removePass(chained(), 1)!
    expect(f.events).toHaveLength(3)
    expect(f.events[2].from).toEqual({ after: 1 }) // was after: 2
  })

  it('does not renumber a chain that points earlier than the removed event', () => {
    const f = removePass(chained(), 3)!
    expect(f.events[1].from).toEqual({ after: 0 })
  })
})

describe('who has the puck', () => {
  const model = buildTimelineModel(stopAndWait)!

  it('says who carries it at a moment', () => {
    expect(carrierAtTime(model, 'puck', 1)).toBe('F1')
  })

  it('says nobody while it is in the air or after it is loose', () => {
    expect(carrierAtTime(model, 'puck', 3.0)).toBeNull() // the first pass is in the air
    expect(carrierAtTime(model, 'puck', 3.55)).toBeNull() // the shot is in the air
  })

  it('counts a moment a couple of milliseconds before it is received as already carried', () => {
    // In this drill F2 receives the puck and walks in with it before shooting.
    const walk = buildTimelineModel(twoOnOne)!
    const received = walk.pucks[0].spans.find((s) => s.carrier === 'F2')!.t0
    expect(carrierAtTime(walk, 'puck', received - 0.002)).toBe('F2') // a click meant for that instant, slightly early
    expect(carrierAtTime(walk, 'puck', received - 0.3)).toBeNull() // but not well before it
    expect(carrierAtTime(walk, 'puck', received - 0.002, 0)).toBeNull() // and not with no slack
  })

  it('names the puck a skater is carrying, or null', () => {
    expect(puckCarriedBy(model, 'F1', 1)).toBe('puck')
    expect(puckCarriedBy(model, 'F2', 1)).toBeNull()
    expect(puckCarriedBy(model, 'ghost', 1)).toBeNull()
  })
})

describe('linking a pass in a flow, then compiling', () => {
  /** Two forwards skating in parallel, nothing passed yet. */
  const base = (): Drill => ({
    version: 1,
    id: 'link',
    title: 'Link',
    rink: 'full',
    actors: [
      { id: 'F1', type: 'forward', start: [20, 20] },
      { id: 'F2', type: 'forward', start: [20, 60] },
      { id: 'puck', type: 'puck', start: [20, 20], carriedBy: 'F1' },
    ],
    steps: [],
  })
  const drillWithPaths = () =>
    compileFlow(base(), {
      paths: {
        F1: [{ kind: 'run', style: 'skate-puck', points: [[20, 20], [140, 20]] }],
        F2: [{ kind: 'run', style: 'skate', speed: 22, points: [[20, 60], [140, 50]] }],
      },
      events: [],
    }).drill

  it('a pass from a point on one path to a point on another is valid, with its speed solved', () => {
    const result = editViaFlow(drillWithPaths(), (f, s) => {
      const from = locateOnPath(f, s, 'F1', [70, 20])!
      const to = locateOnPath(f, s, 'F2', [100, 53])!
      return addPass(f, { puck: 'puck', style: 'pass', from: from.marker, target: { kind: 'marker', marker: to.marker } })
    })!
    expect(result.added).toEqual([])
    expect(validateDrill(result.drill)).toEqual([])
    const pass = result.drill.steps.flatMap((x) => x.moves).find((m) => m.style === 'pass')!
    expect(pass.receiver).toBe('F2')
    expect(pass.speed).toBeGreaterThan(20)
  })

  it('refuses a pass that would land before it leaves, with the reason', () => {
    const result = editViaFlow(drillWithPaths(), (f, s) => {
      const from = locateOnPath(f, s, 'F1', [100, 20])!
      const to = locateOnPath(f, s, 'F2', [40, 58])!
      return addPass(f, { puck: 'puck', style: 'pass', from: from.marker, target: { kind: 'marker', marker: to.marker } })
    })!
    expect(result.added.map((p) => p.code)).toContain('receiver-before-release')
  })

  it('a shot to a spot works too, with the default shot speed', () => {
    const result = editViaFlow(drillWithPaths(), (f, s) => {
      const from = locateOnPath(f, s, 'F1', [130, 20])!
      return addPass(f, { puck: 'puck', style: 'shoot', from: from.marker, target: { kind: 'point', at: [190, 42] } })
    })!
    expect(result.added).toEqual([])
    expect(validateDrill(result.drill)).toEqual([])
  })

  it('imports a drill with a pass, so it can be removed again', () => {
    const withPass = editViaFlow(drillWithPaths(), (f, s) => {
      const from = locateOnPath(f, s, 'F1', [70, 20])!
      const to = locateOnPath(f, s, 'F2', [100, 53])!
      return addPass(f, { puck: 'puck', style: 'pass', from: from.marker, target: { kind: 'marker', marker: to.marker } })
    })!.drill
    const removed = editViaFlow(withPass, (f) => removePass(f, 0))!
    expect(removed.drill.steps.flatMap((x) => x.moves).some((m) => m.style === 'pass')).toBe(false)
    expect(drillToFlow(removed.drill)!.events).toHaveLength(0)
  })
})

describe('believable', () => {
  const from = { point: [0, 0] as [number, number], time: 1 }

  it('accepts a landing a pass can reach in the time', () => {
    const b = believable(from, [60, 0], 2) // 60 ft in 1 s
    expect(b).toEqual({ ok: true, speed: 60 })
  })

  it('rejects one that is not after the pass leaves', () => {
    expect(believable(from, [10, 0], 1)).toMatchObject({ ok: false, reason: 'too-soon' })
    expect(believable(from, [10, 0], 0.5)).toMatchObject({ ok: false, reason: 'too-soon' })
  })

  it('rejects one that would need an impossible speed, or an absurdly slow one', () => {
    expect(believable(from, [200, 0], 1.5)).toMatchObject({ ok: false, reason: 'too-fast' })
    expect(believable(from, [5, 0], 3)).toMatchObject({ ok: false, reason: 'too-slow' })
  })
})

describe('landingZones', () => {
  /** F1 carries along y = 0; F2 skates parallel along y = 30. The pass leaves F1 at x = 60. */
  const parallel = (): Flow => ({
    paths: {
      F1: [{ kind: 'run', style: 'skate-puck', points: [[0, 0], [200, 0]] }],
      F2: [{ kind: 'run', style: 'skate', points: [[0, 30], [200, 30]] }],
    },
    events: [],
  })
  const s: Starts = { F1: [0, 0], F2: [0, 30] }
  const release = { point: [60, 0] as [number, number], time: 60 / 22 }

  it('finds a stretch of F2\'s path, and none on the passer\'s own', () => {
    const zones = landingZones(parallel(), s, release, 'F1')
    expect(zones.length).toBeGreaterThan(0)
    expect(zones.every((z) => z.actor === 'F2')).toBe(true)
  })

  it('every sample inside a zone is believable, and none outside is', () => {
    const f = parallel()
    const zones = landingZones(f, s, release, 'F1')
    const f2 = segmentsFor(f.paths.F2, s.F2)[0]
    for (let arc = 0; arc <= f2.length; arc += 0.5) {
      const ok = believable(release, pointAlong(f2.geometry, arc), f2.t0 + arc / f2.speed).ok
      const inside = zones.some((z) => arc >= z.from - 0.51 && arc <= z.to + 0.51)
      if (ok) expect(inside, `arc ${arc} is believable but not in a zone`).toBe(true)
    }
    for (const z of zones) for (const point of z.points) {
      // every drawn point of a zone must itself be believable
      const arc = z.from + ((z.to - z.from) * z.points.indexOf(point)) / Math.max(1, z.points.length - 1)
      expect(believable(release, point, f2.t0 + arc / f2.speed).ok).toBe(true)
    }
  })

  it('leaves out the part of the path F2 reaches before the pass leaves', () => {
    const zones = landingZones(parallel(), s, release, 'F1')
    const earliest = Math.min(...zones.map((z) => z.from))
    expect(earliest).toBeGreaterThan(60) // F2 is at x = 60 at 2.4 s, before the pass leaves at 2.7 s
  })

  it('finds nothing when the only other skater is at the wrong place and time', () => {
    const f = parallel()
    f.paths.F2 = [{ kind: 'run', style: 'skate', points: [[0, 30], [10, 30]] }] // done almost at once
    expect(landingZones(f, s, release, 'F1')).toEqual([])
  })

  it('ignores a skater who is only waiting', () => {
    const f = parallel()
    f.paths.F2 = [{ kind: 'wait', seconds: 9 }]
    expect(landingZones(f, s, release, 'F1')).toEqual([])
  })
})

describe('snapToLanding', () => {
  const f: Flow = {
    paths: {
      F1: [{ kind: 'run', style: 'skate-puck', points: [[0, 0], [200, 0]] }],
      F2: [{ kind: 'run', style: 'skate', points: [[0, 30], [200, 30]] }],
    },
    events: [],
  }
  const s: Starts = { F1: [0, 0], F2: [0, 30] }
  const zones = landingZones(f, s, { point: [60, 0], time: 60 / 22 }, 'F1')

  it('moves a click in the area onto the believable path, so you can aim at an area', () => {
    const near = zones[0].points[Math.floor(zones[0].points.length / 2)]
    const snap = snapToLanding(zones, [near[0], near[1] + 4], 7)!
    expect(snap.marker.actor).toBe('F2')
    expect(snap.distance).toBeLessThan(5)
    expect(snap.point[1]).toBeCloseTo(30) // back on F2's path
  })

  it('gives a marker that really is believable', () => {
    const near = zones[0].points[0]
    const snap = snapToLanding(zones, near, 7)!
    const seg = segmentsFor(f.paths.F2, s.F2)[0]
    expect(believable({ point: [60, 0], time: 60 / 22 }, snap.point, seg.t0 + snap.marker.at / seg.speed).ok).toBe(true)
  })

  it('gives nothing when the click is too far from every zone, or for the wrong skater', () => {
    expect(snapToLanding(zones, [0, 80], 7)).toBeNull()
    expect(snapToLanding(zones, zones[0].points[0], 7, 'F3')).toBeNull()
  })
})

describe('explain', () => {
  it('says why, and which way to move', () => {
    expect(explain({ ok: false, reason: 'too-soon', speed: null, seconds: -0.4 }, 'F2', 'F1')).toContain('before the pass can leave')
    expect(explain({ ok: false, reason: 'too-fast', speed: 140, seconds: 0.3 }, 'F2', 'F1')).toContain('140 ft/s')
    expect(explain({ ok: false, reason: 'too-fast', speed: 140, seconds: 0.3 }, 'F2', 'F1')).toContain('further along')
    expect(explain({ ok: false, reason: 'too-slow', speed: 9, seconds: 4 }, 'F2', 'F1')).toContain('earlier')
  })
})

describe('passing from a skater who has no path', () => {
  /** F1 starts with the puck and nobody has a path: a coach is standing by to take the first pass. */
  const empty = (): Drill => ({
    version: 1,
    id: 'feed',
    title: 'Feed',
    rink: 'full',
    actors: [
      { id: 'F1', type: 'forward', start: [50, 40] },
      { id: 'C1', type: 'coach', start: [20, 40] },
      { id: 'puck', type: 'puck', start: [50, 40], carriedBy: 'F1' },
    ],
    steps: [],
  })

  it('knows who has the puck in a drill where nothing has happened yet (it has no length)', () => {
    const model = buildTimelineModel(empty())!
    expect(model.duration).toBe(0)
    expect(carrierAtTime(model, 'puck', 0)).toBe('F1')
    expect(puckCarriedBy(model, 'F1', 0)).toBe('puck')
    expect(firstPossession(model, 'F1')).toEqual({ puck: 'puck', time: 0 })
  })

  it('counts a skater who has the puck at the very end, when the drill stops as a pass lands', () => {
    const d = editViaFlow(empty(), (f) =>
      addPass(f, { puck: 'puck', style: 'pass', from: { actor: 'F1', piece: 0, at: 0 }, target: { kind: 'point', at: [20, 40], receiver: 'C1' } }),
    )!.drill
    const model = buildTimelineModel(d)!
    const first = firstPossession(model, 'C1')!
    expect(first.puck).toBe('puck')
    expect(first.time).toBeCloseTo(model.duration) // from the instant it arrives
    expect(carrierAtTime(model, 'puck', model.duration)).toBe('C1')
  })

  it('knows when a skater first has a puck: at the start for the one who begins with it', () => {
    const d = compileFlow(empty(), { paths: { F1: [{ kind: 'run', style: 'skate', points: [[50, 40], [90, 40]] }] }, events: [] }).drill
    expect(firstPossession(buildTimelineModel(d)!, 'F1')).toEqual({ puck: 'puck', time: 0 })
  })

  it('and the instant a pass reaches them, for one who receives it later', () => {
    const d = editViaFlow(empty(), (f) =>
      addPass(f, { puck: 'puck', style: 'pass', from: { actor: 'F1', piece: 0, at: 0 }, target: { kind: 'point', at: [20, 40], receiver: 'C1' } }),
    )!.drill
    // The pass arrives, then F1 skates on and the coach holds the puck (nobody moves for the coach).
    const model = buildTimelineModel(d)!
    const coach = firstPossession(model, 'C1')
    expect(coach === null || coach.time > 0).toBe(true)
  })

  it('is null for a skater who never has one', () => {
    expect(firstPossession(buildTimelineModel(empty())!, 'C1')).toBeNull()
  })

  it('lets F1 pass to the coach at the very start, with neither having a path', () => {
    const result = editViaFlow(empty(), (f) =>
      addPass(f, { puck: 'puck', style: 'pass', from: { actor: 'F1', piece: 0, at: 0 }, target: { kind: 'point', at: [20, 40], receiver: 'C1' } }),
    )!
    expect(result.added).toEqual([])
    expect(validateDrill(result.drill)).toEqual([])
    const pass = result.drill.steps.flatMap((s) => s.moves).find((m) => m.style === 'pass')!
    expect(pass.receiver).toBe('C1')
    expect(pass.to).toEqual([20, 40])
    expect(buildTimeline(result.drill).at(0).puck).toEqual([50, 40]) // starts with F1
  })

  it('then lets the coach pass it back as it arrives', () => {
    const first = editViaFlow(empty(), (f) =>
      addPass(f, { puck: 'puck', style: 'pass', from: { actor: 'F1', piece: 0, at: 0 }, target: { kind: 'point', at: [20, 40], receiver: 'C1' } }),
    )!.drill
    const back = editViaFlow(first, (f) =>
      addPass(f, { puck: 'puck', style: 'pass', from: { after: 0 }, target: { kind: 'point', at: [50, 40], receiver: 'F1' } }),
    )!
    expect(back.added).toEqual([])
    expect(validateDrill(back.drill)).toEqual([])
    const passes = back.drill.steps.flatMap((s) => s.moves).filter((m) => m.style === 'pass')
    expect(passes.map((m) => m.receiver)).toEqual(['C1', 'F1'])
    const end = buildTimeline(back.drill)
    expect(Math.hypot(end.at(end.duration).puck[0] - 50, end.at(end.duration).puck[1] - 40)).toBeLessThan(1) // back with F1
  })

  it('and F1 can start moving afterwards without disturbing the pass', () => {
    const first = editViaFlow(empty(), (f) =>
      addPass(f, { puck: 'puck', style: 'pass', from: { actor: 'F1', piece: 0, at: 0 }, target: { kind: 'point', at: [20, 40], receiver: 'C1' } }),
    )!.drill
    const moved = editViaFlow(first, (f, s) => appendRun(f, s, 'F1', 'skate', [[50, 40], [110, 60]]))!
    expect(moved.added).toEqual([])
    expect(validateDrill(moved.drill)).toEqual([])
  })
})
