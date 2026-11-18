import type { Drill } from './types'
import cycleJson from '../../drills/cycle-give-and-go.json'

/**
 * A small drill kept inside the tests on purpose, NOT read from drills/.
 *
 * It is deliberately stop-and-go: everyone skates to a mark, the pass goes to
 * a stationary receiver, then play resumes. That is the simplest shape that
 * still exercises a carried puck, a hand-off and a shot, and it makes the
 * expected numbers easy to reason about. The real library drill can change
 * (and has: it now passes in stride) without breaking these tests.
 */
export const twoOnOne: Drill = {
  version: 1,
  id: '2-on-1',
  title: '2-on-1 Rush (test fixture)',
  tags: ['rush', 'offence'],
  rink: 'full',
  actors: [
    { id: 'F1', type: 'forward', start: [95, 25] },
    { id: 'F2', type: 'forward', start: [95, 60] },
    { id: 'D', type: 'defender', start: [140, 42] },
    { id: 'puck', type: 'puck', start: [95, 25], carriedBy: 'F1' },
  ],
  steps: [
    {
      name: 'Attack',
      moves: [
        { actor: 'F1', style: 'skate-puck', speed: 25, points: [[95, 25], [150, 28]] },
        { actor: 'F2', style: 'skate', speed: 25, points: [[95, 60], [155, 58]] },
        { actor: 'D', style: 'backward', speed: 12, points: [[140, 42], [150, 38]] },
      ],
    },
    { name: 'Pass', moves: [{ actor: 'puck', style: 'pass', speed: 60, to: 'F2' }] },
    {
      name: 'Walk in',
      moves: [{ actor: 'F2', style: 'skate-puck', speed: 15, points: [[155, 58], [165, 55]] }],
    },
    { name: 'Shot', moves: [{ actor: 'puck', style: 'shoot', speed: 80, to: [189, 42] }] },
  ],
}

/**
 * Read from the library: a drill with a banked pass and receivers who pick
 * the puck up while skating. If it is edited, the tests that use it (and the
 * numbers in them) may need updating; they are tied to its geometry.
 *
 * TypeScript widens JSON arrays to number[], so we cast to Drill. That is
 * safe only because the file is checked against schema/drill.schema.json and
 * the library test; the cast is the boundary where "trusted data" enters
 * typed code.
 */
export const cycleGiveAndGo = cycleJson as unknown as Drill

/** Deep copy, so tests can break a drill without affecting the fixture. */
export function clone(drill: Drill): Drill {
  return structuredClone(drill)
}
