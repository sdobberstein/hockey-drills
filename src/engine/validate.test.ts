import { describe, expect, it } from 'vitest'
import { clone, twoOnOne } from './fixtures'
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

  it('rejects releasing the puck while its carrier is still moving', () => {
    // The mistake we originally made in the 2-on-1: skate and shoot together.
    const d = clone(twoOnOne)
    d.steps[2].moves.push(d.steps[3].moves[0])
    d.steps.splice(3, 1)
    expect(codes(d)).toContain('carrier-moves-during-release')
  })

  it('rejects a receiver that moves during the pass', () => {
    const d = clone(twoOnOne)
    d.steps[1].moves.push({
      actor: 'F2',
      style: 'skate',
      points: [[155, 58], [160, 58]],
    })
    expect(codes(d)).toContain('receiver-moves-during-pass')
  })

  it('rejects a carried actor moving on its own', () => {
    const d = clone(twoOnOne)
    d.steps[0].moves.push({ actor: 'puck', style: 'skate', points: [[95, 25], [100, 25]] })
    expect(codes(d)).toContain('carried-actor-moves')
  })
})
