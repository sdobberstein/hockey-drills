import type { Drill } from './types'
import twoOnOneJson from '../../drills/2-on-1.json'
import cycleJson from '../../drills/cycle-give-and-go.json'

/**
 * The reference drill, imported straight from the library folder so tests
 * exercise the same file the app will ship.
 *
 * TypeScript widens JSON arrays to number[], so we cast to Drill. That is
 * safe only because the file is checked against schema/drill.schema.json;
 * the cast is the boundary where "trusted data" enters typed code.
 */
export const twoOnOne = twoOnOneJson as unknown as Drill

/** A drill with a banked pass and passes to receivers who are skating. */
export const cycleGiveAndGo = cycleJson as unknown as Drill

/** Deep copy, so tests can break a drill without affecting the fixture. */
export function clone(drill: Drill): Drill {
  return structuredClone(drill)
}
