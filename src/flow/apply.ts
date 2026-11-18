import type { Drill } from '../engine/types'
import { compileFlow, type FlowProblem } from './compile'
import { drillToFlow } from './import'
import type { Flow } from './types'
import type { Starts } from './edit'

export interface FlowEditResult {
  /** The drill with the edit applied (its steps rebuilt from the edited flow). */
  drill: Drill
  /** Problems that the edit introduced, which the drill did not have before. Empty means safe to keep. */
  added: FlowProblem[]
}

/**
 * Apply an edit to a drill by way of its flow: recover the flow from the steps,
 * edit it, and compile it back. The round trip is lossless to within a fraction
 * of a foot (see flow.test.ts), so the edit lands exactly where it was made.
 *
 * `added` is what the edit broke. A drill that already has quirks does not
 * block edits because of them; only a problem the edit introduced does. The
 * caller decides what to do (refuse, or show why).
 *
 * Returns null if the drill cannot be turned into a flow, or the edit declines.
 */
export function editViaFlow(drill: Drill, edit: (flow: Flow, starts: Starts) => Flow | null): FlowEditResult | null {
  const flow = drillToFlow(drill)
  if (!flow) return null
  const starts: Starts = Object.fromEntries(drill.actors.map((a) => [a.id, a.start]))
  const next = edit(flow, starts)
  if (!next) return null

  const before = compileFlow(drill, flow).problems
  const after = compileFlow(drill, next)
  const added = after.problems.filter((p) => !before.some((b) => b.code === p.code))
  return { drill: after.drill, added }
}
