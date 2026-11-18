import Ajv2020, { type ErrorObject } from 'ajv/dist/2020'
import schema from '../../schema/drill.schema.json'
import type { Drill } from './types'
import { validateDrill, type Issue } from './validate'

/**
 * The one door for a drill that comes from outside the repo (a share link, a
 * pasted or opened file). Nothing downstream may assume the shape of such data,
 * so we check it in two layers, in this order:
 *
 *   1. Structure, against schema/drill.schema.json (types, enums, ranges,
 *      "exactly one of points/to"). Until this passes, the data is not even
 *      known to be a Drill, so the semantic checks cannot run on it safely.
 *   2. Meaning, via validateDrill (known ids, passes landing on receivers...).
 *
 * Files in drills/ go through the same door in the library test, so a drill
 * that would be rejected from a link is rejected in the repo too.
 */

export interface ParseIssue {
  code: Issue['code'] | 'schema'
  message: string
  location: string
}

export interface ParseResult {
  /** The drill, when it is valid. Null otherwise. */
  drill: Drill | null
  issues: ParseIssue[]
}

// allErrors reports every problem in one pass instead of stopping at the
// first, which is kinder when fixing a hand-edited file.
const validateStructure = new Ajv2020({ allErrors: true }).compile(schema)

/** Cap on how many structural errors we show; a badly broken file makes hundreds. */
const MAX_SCHEMA_ISSUES = 20

export function parseDrill(input: unknown): ParseResult {
  if (!validateStructure(input)) {
    const issues = (validateStructure.errors ?? []).slice(0, MAX_SCHEMA_ISSUES).map(toIssue)
    return { drill: null, issues }
  }
  // The schema says this is a Drill; that check is why the cast is safe.
  const drill = input as unknown as Drill
  const issues = validateDrill(drill)
  return issues.length > 0 ? { drill: null, issues } : { drill, issues: [] }
}

function toIssue(error: ErrorObject): ParseIssue {
  const detail =
    error.keyword === 'enum' ? ` (${(error.params.allowedValues as unknown[]).join(', ')})` : ''
  return {
    code: 'schema',
    message: `${error.message ?? 'is invalid'}${detail}`,
    location: error.instancePath === '' ? 'drill' : error.instancePath.slice(1).replace(/\//g, '.'),
  }
}
