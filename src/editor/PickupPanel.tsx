import type { Starts } from '../flow/edit'
import { removePickup } from '../flow/pickupEdit'
import type { Flow } from '../flow/types'
import { markerTime, segmentsFor } from '../flow/timeline'

interface Props {
  flow: Flow
  starts: Starts
  index: number
  onEdit: (edit: (flow: Flow, starts: Starts) => Flow | null) => void
}

/** A pickup selected in the flow view: who takes which puck, and when. */
export function PickupPanel({ flow, starts, index, onEdit }: Props) {
  const pickup = flow.pickups?.[index]
  if (!pickup) return null
  const { actor } = pickup.marker
  const t = markerTime(segmentsFor(flow.paths[actor] ?? [], starts[actor]), pickup.marker)
  return (
    <section>
      <h3>
        Pick up: {actor}
      </h3>
      <p className="hint">
        {actor} takes the {pickup.puck} at {t.toFixed(2)} s, where this run reaches it. Until then it lies where it landed. Reshape or retime the run and the
        pickup goes with it.
      </p>
      <button type="button" onClick={() => onEdit((f) => removePickup(f, index))}>
        Remove pickup
      </button>
    </section>
  )
}
