import { describe, expect, it } from 'vitest'
import { clone, cycleGiveAndGo, twoOnOne } from './fixtures'
import type { Drill } from './types'
import { validateDrill, type IssueCode } from './validate'

const codes = (drill: Drill): IssueCode[] => validateDrill(drill).map((i) => i.code)

describe('validateDrill', () => {
  it('accepts the 2-on-1 reference drill', () => {
    expect(validateDrill(twoOnOne)).toEqual([])
  })

  it('rejects duplicate actor ids', () => {
    const d = clone(twoOnOne)
    d.actors.push({ ...d.actors[0] })
    expect(codes(d)).toContain('duplicate-actor-id')
  })

  it('rejects a carrier that does not exist', () => {
    const d = clone(twoOnOne)
    d.actors[3].carriedBy = 'ghost'
    expect(codes(d)).toEqual(['unknown-carrier'])
  })

  it('rejects a carrier that is itself carried', () => {
    const d = clone(twoOnOne)
    d.actors[0].carriedBy = 'F2'
    expect(codes(d)).toContain('unknown-carrier')
  })

  it('rejects moves by unknown actors', () => {
    const d = clone(twoOnOne)
    d.steps[0].moves[0].actor = 'ghost'
    expect(codes(d)).toContain('unknown-actor')
  })

  it('rejects a pass aimed at an unknown actor', () => {
    const d = clone(twoOnOne)
    d.steps[1].moves[0] = { actor: 'puck', style: 'pass', to: 'ghost' }
    expect(codes(d)).toEqual(['unknown-target'])
  })

  it('rejects two moves for one actor in a step', () => {
    const d = clone(twoOnOne)
    d.steps[0].moves.push({ ...d.steps[0].moves[0] })
    expect(codes(d)).toContain('duplicate-move')
  })

  it('rejects a path that starts away from the actor', () => {
    const d = clone(twoOnOne)
    d.steps[0].moves[0] = {
      actor: 'F1',
      style: 'skate-puck',
      points: [[10, 10], [150, 28]],
    }
    expect(codes(d)).toEqual(['path-start-mismatch'])
  })

  it('rejects releasing a puck nobody carries', () => {
    const d = clone(twoOnOne)
    // By the end of the drill the puck is loose; shooting it again is invalid.
    d.steps.push({ moves: [{ actor: 'puck', style: 'shoot', to: [189, 42] }] })
    expect(codes(d)).toContain('release-without-carrier')
  })

  it('rejects pass styles on a non-puck actor', () => {
    const d = clone(twoOnOne)
    d.steps[0].moves[0] = { actor: 'F1', style: 'pass', to: [150, 28] }
    expect(codes(d)).toContain('release-style-needs-puck')
  })

  it('lets the passer keep skating as the puck leaves', () => {
    // Releasing happens at the start of the step, from where the carrier
    // stood then; the carrier is free to skate on.
    const d = clone(twoOnOne)
    d.steps[1].moves.push({ actor: 'F1', style: 'skate', points: [[150, 28], [160, 20]] })
    expect(validateDrill(d)).toEqual([])
  })

  it('rejects a receiver who is not where the pass arrives', () => {
    const d = clone(twoOnOne)
    d.steps[1].moves.push({
      actor: 'F2',
      style: 'skate',
      points: [[155, 58], [175, 58]],
    })
    // F2 is now somewhere else for the rest of the drill, so later steps also
    // disagree; we only care that the miss itself is reported.
    expect(codes(d)).toContain('receiver-misses-pass')
  })

  it('accepts a receiver who skates onto the landing spot in stride', () => {
    const d = clone(twoOnOne)
    // Pass to a spot 10 ft ahead of F2 and have F2 arrive there as it lands.
    // Distance 150,28 -> 165,58 is 33.5 ft; at 60 ft/s that is 0.559 s, and F2
    // at 18 ft/s covers 10.05 ft in that time.
    d.steps[1].moves = [
      { actor: 'puck', style: 'pass', speed: 60, to: [165, 58], receiver: 'F2' },
      { actor: 'F2', style: 'skate', speed: 18, points: [[155, 58], [165, 58]] },
    ]
    // F2 ends the pass step at 165,58, so the next step must start there.
    d.steps[2].moves[0] = { actor: 'F2', style: 'skate-puck', speed: 15, points: [[165, 58], [168, 55]] }
    expect(validateDrill(d)).toEqual([])
  })

  it('rejects a receiver that does not exist', () => {
    const d = clone(twoOnOne)
    d.steps[1].moves[0] = { actor: 'puck', style: 'pass', to: [155, 58], receiver: 'ghost' }
    expect(codes(d)).toEqual(['unknown-target'])
  })

  it('rejects a carried actor moving on its own', () => {
    const d = clone(twoOnOne)
    d.steps[0].moves.push({ actor: 'puck', style: 'skate', points: [[95, 25], [100, 25]] })
    expect(codes(d)).toContain('carried-actor-moves')
  })

  describe('suggestions for a missed pass', () => {
    // The bank pass in Cycle Give and Go is timed for 30 ft/s. Make it too
    // fast, so the puck beats F2 to the landing spot.
    const tooFast = () => {
      const d = clone(cycleGiveAndGo)
      const pass = d.steps[1].moves[0]
      pass.speed = 45
      return d
    }

    it('suggests a pass speed that makes the receiver arrive with the puck', () => {
      const issue = validateDrill(tooFast()).find((i) => i.code === 'receiver-misses-pass')!
      expect(issue.suggestion?.passSpeed).toBeCloseTo(30, 0)
      expect(issue.message).toContain('To fix:')

      // Applying the suggestion should clear the problem.
      const fixed = tooFast()
      fixed.steps[1].moves[0].speed = issue.suggestion!.passSpeed
      expect(validateDrill(fixed)).toEqual([])
    })

    it('suggests a landing spot for a straight pass, and it works', () => {
      // A straight pass from the same release point, at the same too-fast speed.
      const straight = () => {
        const d = tooFast()
        d.steps[1].moves[0] = { actor: 'puck', style: 'pass', speed: 45, to: [172, 80], receiver: 'F2' }
        return d
      }
      const issue = validateDrill(straight()).find((i) => i.code === 'receiver-misses-pass')!
      expect(issue.suggestion?.landAt).toBeDefined()

      const fixed = straight()
      fixed.steps[1].moves[0] = { actor: 'puck', style: 'pass', speed: 45, to: issue.suggestion!.landAt!, receiver: 'F2' }
      expect(validateDrill(fixed)).toEqual([])
    })

    it('does not suggest moving the end of a pass that bends', () => {
      const issue = validateDrill(tooFast()).find((i) => i.code === 'receiver-misses-pass')!
      expect(issue.suggestion?.landAt).toBeUndefined() // the bank has three points
    })

    it('offers only the landing spot when the receiver never reaches it', () => {
      const d = clone(twoOnOne)
      d.steps[1].moves.push({ actor: 'F2', style: 'skate', points: [[155, 58], [175, 58]] })
      const issue = validateDrill(d).find((i) => i.code === 'receiver-misses-pass')!
      expect(issue.suggestion?.landAt).toBeDefined()
      expect(issue.suggestion?.passSpeed).toBeUndefined()
    })
  })
})
