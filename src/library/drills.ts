import type { Drill } from '../engine/types'

/**
 * Every drill in drills/, bundled at build time. This is the whole "library"
 * (PLAN.md, "Architecture"): files in the repo, no backend. Adding a drill
 * means adding a file.
 *
 * TypeScript sees JSON arrays as number[], so we cast to Drill. The library
 * test sends every file through parseDrill, so the cast is checked there.
 */
export const libraryDrills = Object.values(
  import.meta.glob('../../drills/*.json', { eager: true, import: 'default' }),
) as Drill[]
