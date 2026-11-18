import { describe, expect, it } from 'vitest'
import { clone, cycleGiveAndGo, twoOnOne } from '../engine/fixtures'
import { validateDrill } from '../engine/validate'
import {
  addRelease,
  applySuggestion,
  carrierAt,
  deleteMove,
  findMove,
  MAX_PASS_SPEED,
  MIN_PASS_SPEED,
  passesTiedToRunEnd,
  RELEASE_STYLES,
  reshapeRoute,
  retimePass,
  setLanding,
  tieToRunEnd,
  updateRelease,
} from './releases'
import { buildTimeline } from '../engine/timeline'
import { addRoute, findRoute } from './routes'

/**
 * After "Attack": F1 (150,28) carries the puck, F2 waits at (155,58), and
 * there is an empty step ready for a release.
 */
const base = () => {
  const d = clone(twoOnOne)
  d.steps = [d.steps[0], { name: 'Release', moves: [] }]
  return d
}

describe('carrierAt', () => {
  it('says who carries the puck when a step begins', () => {
    expect(carrierAt(base(), 0, 'puck')).toBe('F1')
    expect(carrierAt(base(), 1, 'puck')).toBe('F1')
  })

  it('is undefined once the puck has been shot and is loose', () => {
    const shot = addRelease(base(), 1, 'puck', 'shoot', { kind: 'point', at: [189, 42] })
    const later = { ...shot, steps: [...shot.steps, { moves: [] }] }
    expect(carrierAt(later, 2, 'puck')).toBeUndefined()
  })
})

describe('addRelease', () => {
  it('adds a pass to a teammate, who becomes the receiver without being named', () => {
    const d = addRelease(base(), 1, 'puck', 'pass', { kind: 'actor', id: 'F2' })
    expect(findMove(d, 1, 'puck')).toEqual({ actor: 'puck', style: 'pass', to: 'F2' })
    expect(validateDrill(d)).toEqual([])
  })

  it('adds a shot at a spot, and a pass to a spot with a named receiver', () => {
    const shot = addRelease(base(), 1, 'puck', 'shoot', { kind: 'point', at: [189, 42] })
    expect(findMove(shot, 1, 'puck')).toEqual({ actor: 'puck', style: 'shoot', to: [189, 42] })
    const lead = addRelease(base(), 1, 'puck', 'pass', { kind: 'point', at: [160, 60] }, 'F2')
    expect(findMove(lead, 1, 'puck')).toMatchObject({ to: [160, 60], receiver: 'F2' })
  })

  it('adds a bank: a pass that follows a path', () => {
    const d = addRelease(base(), 1, 'puck', 'pass', { kind: 'path', points: [[0, 0], [160, 84], [155, 58]] }, 'F2')
    const move = findMove(d, 1, 'puck')!
    expect(move.points).toHaveLength(3)
    expect(move.points![0]).toEqual([150, 28]) // starts where the carrier stands, whatever was passed
  })

  it('refuses a non-puck, a second release, a puck nobody carries, or a route style', () => {
    const d = base()
    expect(addRelease(d, 1, 'F1', 'pass', { kind: 'actor', id: 'F2' })).toBe(d)
    expect(addRelease(d, 1, 'puck', 'skate', { kind: 'actor', id: 'F2' })).toBe(d)
    const once = addRelease(d, 1, 'puck', 'pass', { kind: 'actor', id: 'F2' })
    expect(addRelease(once, 1, 'puck', 'shoot', { kind: 'point', at: [189, 42] })).toBe(once)
    // After the shot the puck is loose, so a later step cannot release it again.
    const shot = addRelease(d, 1, 'puck', 'shoot', { kind: 'point', at: [189, 42] })
    const later = { ...shot, steps: [...shot.steps, { moves: [] }] }
    expect(addRelease(later, 2, 'puck', 'pass', { kind: 'actor', id: 'F2' })).toBe(later)
  })

  it('refuses an unknown target, receiver or step', () => {
    const d = base()
    expect(addRelease(d, 1, 'puck', 'pass', { kind: 'actor', id: 'ghost' })).toBe(d)
    expect(addRelease(d, 1, 'puck', 'pass', { kind: 'point', at: [1, 1] }, 'ghost')).toBe(d)
    expect(addRelease(d, 9, 'puck', 'pass', { kind: 'actor', id: 'F2' })).toBe(d)
    expect(addRelease(d, 1, 'puck', 'pass', { kind: 'path', points: [[1, 1]] })).toBe(d)
  })

  it('offers pass, shot and drop pass only', () => {
    expect([...RELEASE_STYLES].sort()).toEqual(['drop-pass', 'pass', 'shoot'])
  })
})

describe('editing a release', () => {
  const withPass = () => addRelease(base(), 1, 'puck', 'pass', { kind: 'actor', id: 'F2' })

  it('changes style, speed and receiver, and clears them', () => {
    let d = updateRelease(withPass(), 1, 'puck', { style: 'drop-pass', speed: 30, receiver: 'F1' })
    expect(findMove(d, 1, 'puck')).toMatchObject({ style: 'drop-pass', speed: 30, receiver: 'F1' })
    d = updateRelease(d, 1, 'puck', { speed: null, receiver: null })
    expect('speed' in findMove(d, 1, 'puck')!).toBe(false)
    expect('receiver' in findMove(d, 1, 'puck')!).toBe(false)
  })

  it('refuses a route style, a bad speed, an unknown receiver, or a move that is not a release', () => {
    const d = withPass()
    expect(updateRelease(d, 1, 'puck', { style: 'skate' })).toBe(d)
    expect(updateRelease(d, 1, 'puck', { speed: 0 })).toBe(d)
    expect(updateRelease(d, 1, 'puck', { receiver: 'ghost' })).toBe(d)
    expect(updateRelease(d, 0, 'F1', { speed: 20 })).toBe(d) // F1's move is a route
  })

  it('deletes a release', () => {
    expect(findMove(deleteMove(withPass(), 1, 'puck'), 1, 'puck')).toBeUndefined()
  })
})

describe('setLanding', () => {
  it('turns a pass to a teammate into a lead pass to that teammate', () => {
    const d = setLanding(addRelease(base(), 1, 'puck', 'pass', { kind: 'actor', id: 'F2' }), 1, 'puck', [160, 55])
    expect(findMove(d, 1, 'puck')).toMatchObject({ to: [160, 55], receiver: 'F2' })
  })

  it('leaves a bank alone', () => {
    const d = addRelease(base(), 1, 'puck', 'pass', { kind: 'path', points: [[0, 0], [160, 84], [155, 58]] })
    expect(setLanding(d, 1, 'puck', [1, 1])).toBe(d)
  })
})

describe('retimePass', () => {
  const skating = () => {
    // F2 skates 20 ft along the boards during the pass, and the pass is aimed at where F2 starts.
    let d = addRelease(base(), 1, 'puck', 'pass', { kind: 'actor', id: 'F2' })
    d = addRoute(d, 1, 'F2', 'skate', [[155, 58], [175, 58]])
    return d
  }

  it('starts out missing, because the pass is aimed at where the receiver was', () => {
    expect(validateDrill(skating()).map((i) => i.code)).toContain('receiver-misses-pass')
  })

  it('moves the landing spot onto the receiver\'s route so the drill validates', () => {
    const fixed = retimePass(skating(), 1, 'puck')
    const move = findMove(fixed, 1, 'puck')!
    expect(move.receiver).toBe('F2')
    expect(Array.isArray(move.to)).toBe(true)
    const [x, y] = move.to as [number, number]
    expect(x).toBeGreaterThan(155)
    expect(x).toBeLessThanOrEqual(175)
    expect(y).toBeCloseTo(58, 0)
    expect(validateDrill(fixed)).toEqual([])
  })

  it('holds the pass speed fixed', () => {
    const d = updateRelease(skating(), 1, 'puck', { speed: 50 })
    expect(findMove(retimePass(d, 1, 'puck'), 1, 'puck')!.speed).toBe(50)
  })

  it('just aims at a receiver who is standing still', () => {
    const d = retimePass(addRelease(base(), 1, 'puck', 'pass', { kind: 'point', at: [160, 60] }, 'F2'), 1, 'puck')
    expect(findMove(d, 1, 'puck')).toEqual({ actor: 'puck', style: 'pass', to: 'F2' })
  })

  it('does nothing for a pass with no receiver, a bank, or a move that is not a release', () => {
    const noReceiver = addRelease(base(), 1, 'puck', 'shoot', { kind: 'point', at: [189, 42] })
    expect(retimePass(noReceiver, 1, 'puck')).toBe(noReceiver)
    const bank = addRelease(base(), 1, 'puck', 'pass', { kind: 'path', points: [[0, 0], [160, 84], [155, 58]] }, 'F2')
    expect(retimePass(bank, 1, 'puck')).toBe(bank)
    expect(retimePass(base(), 0, 'F1')).toEqual(base())
  })
})

describe('applySuggestion', () => {
  const tooFast = () => {
    const d = clone(cycleGiveAndGo)
    d.steps[1].moves[0].speed = 45
    return d
  }
  const issueOf = (d: ReturnType<typeof tooFast>) => validateDrill(d).find((i) => i.code === 'receiver-misses-pass')!

  it('applies a suggested pass speed, which fixes the drill', () => {
    const d = tooFast()
    const issue = issueOf(d)
    const fixed = applySuggestion(d, issue.location, issue.suggestion!)
    expect(validateDrill(fixed)).toEqual([])
    expect(findMove(fixed, 1, 'puck')!.speed).toBeCloseTo(30, 0)
  })

  it('applies a suggested landing spot for a straight pass, which fixes the drill', () => {
    const d = tooFast()
    d.steps[1].moves[0] = { actor: 'puck', style: 'pass', speed: 45, to: [172, 80], receiver: 'F2' }
    const issue = issueOf(d)
    const fixed = applySuggestion(d, issue.location, { landAt: issue.suggestion!.landAt })
    expect(validateDrill(fixed)).toEqual([])
  })

  it('ignores a location it cannot read', () => {
    const d = tooFast()
    expect(applySuggestion(d, 'somewhere', { passSpeed: 20 })).toBe(d)
    expect(applySuggestion(d, 'steps[9].moves[0]', { passSpeed: 20 })).toBe(d)
  })
})

describe('tieToRunEnd: the pass lands where the receiver\'s run ends', () => {
  /** F2 runs 30 ft along the boards while F1 passes to them. */
  const aimedAtF2 = () => {
    let d = addRelease(base(), 1, 'puck', 'pass', { kind: 'actor', id: 'F2' })
    d = addRoute(d, 1, 'F2', 'skate', [[155, 58], [185, 58]])
    return d
  }

  it('lands exactly at the end of F2\'s run', () => {
    const d = tieToRunEnd(aimedAtF2(), 1, 'puck')
    expect(findMove(d, 1, 'puck')).toMatchObject({ to: [185, 58], receiver: 'F2' })
  })

  it('sets the pass speed so the puck arrives as F2 does, and the drill validates', () => {
    const d = tieToRunEnd(aimedAtF2(), 1, 'puck')
    expect(validateDrill(d)).toEqual([])
    const step = buildTimeline(d).plan.steps[1]
    const pass = step.moves.find((m) => m.actor === 'puck')!
    const run = step.moves.find((m) => m.actor === 'F2')!
    expect(Math.abs(pass.duration - run.duration)).toBeLessThan(0.03)
  })

  it('falls back to meeting along the run when the speed needed is not believable', () => {
    // A 1 ft run: matching it would need a pass faster than any shot.
    let d = addRelease(base(), 1, 'puck', 'pass', { kind: 'actor', id: 'F2' })
    d = addRoute(d, 1, 'F2', 'skate', [[155, 58], [156, 58]])
    const tied = tieToRunEnd(d, 1, 'puck')
    const speed = findMove(tied, 1, 'puck')!.speed
    expect(speed === undefined || (speed >= MIN_PASS_SPEED && speed <= MAX_PASS_SPEED)).toBe(true)
  })

  it('leaves a receiver who stands still, a bank, and a pass with no receiver alone', () => {
    const still = addRelease(base(), 1, 'puck', 'pass', { kind: 'actor', id: 'F2' })
    expect(tieToRunEnd(still, 1, 'puck')).toBe(still)
    const none = addRelease(base(), 1, 'puck', 'shoot', { kind: 'point', at: [189, 42] })
    expect(tieToRunEnd(none, 1, 'puck')).toBe(none)
  })
})

describe('passes follow the run they are tied to', () => {
  const tied = () => {
    let d = addRelease(base(), 1, 'puck', 'pass', { kind: 'actor', id: 'F2' })
    d = addRoute(d, 1, 'F2', 'skate', [[155, 58], [185, 58]])
    return tieToRunEnd(d, 1, 'puck')
  }

  it('knows which passes land at the end of a run', () => {
    expect(passesTiedToRunEnd(tied(), 1, 'F2')).toEqual(['puck'])
    const aimedAtStart = addRoute(addRelease(base(), 1, 'puck', 'pass', { kind: 'actor', id: 'F2' }), 1, 'F2', 'skate', [[155, 58], [185, 58]])
    expect(passesTiedToRunEnd(aimedAtStart, 1, 'F2')).toEqual([])
  })

  it('moves the landing with the end of the run, and the drill stays valid', () => {
    const d = reshapeRoute(tied(), 1, 'F2', [[155, 58], [180, 50]])
    expect(findRoute(d, 1, 'F2')!.points[1]).toEqual([180, 50])
    expect(findMove(d, 1, 'puck')).toMatchObject({ to: [180, 50], receiver: 'F2' })
    expect(validateDrill(d)).toEqual([])
  })

  it('does not move a pass that was not tied to the run', () => {
    const d = addRelease(base(), 1, 'puck', 'pass', { kind: 'point', at: [160, 55] }, 'F2')
    const withRun = addRoute(d, 1, 'F2', 'skate', [[155, 58], [185, 58]])
    const reshaped = reshapeRoute(withRun, 1, 'F2', [[155, 58], [180, 50]])
    expect(findMove(reshaped, 1, 'puck')!.to).toEqual([160, 55])
  })
})
