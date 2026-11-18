import { pathLength } from '../engine/geometry'
import type { PlannedMove } from '../engine/plan'
import type { Drill, MoveStyle } from '../engine/types'
import { CommitField } from './CommitField'
import { deleteRoute, findRoute, ROUTE_STYLES, updateRoute } from './routes'

interface Props {
  drill: Drill
  step: number
  actor: string
  /** The resolved move, for length and timing. */
  planned: PlannedMove | undefined
  /** How long the whole step lasts. */
  stepDuration: number
  onEdit: (next: Drill) => void
}

/** Properties of the selected route. */
export function RoutePanel({ drill, step, actor, planned, stepDuration, onEdit }: Props) {
  const route = findRoute(drill, step, actor)
  if (!route) return null

  const slowest = planned !== undefined && stepDuration > 0 && planned.duration >= stepDuration - 1e-9

  return (
    <section>
      <h3>
        Route: {actor} <span className="muted">(step {step + 1})</span>
      </h3>

      <label className="field">
        <span>Style</span>
        <select value={route.style} onChange={(e) => onEdit(updateRoute(drill, step, actor, { style: e.target.value as MoveStyle }))}>
          {ROUTE_STYLES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <CommitField
        label="Speed (ft/s)"
        value={route.speed === undefined ? '' : String(route.speed)}
        placeholder={planned ? `${planned.speed} (default)` : 'default'}
        onCommit={(text) => {
          const trimmed = text.trim()
          if (trimmed === '') onEdit(updateRoute(drill, step, actor, { speed: null }))
          else if (Number(trimmed) > 0) onEdit(updateRoute(drill, step, actor, { speed: Number(trimmed) }))
        }}
      />

      <label className="check">
        <input
          type="checkbox"
          checked={route.smooth === true}
          onChange={(e) => onEdit(updateRoute(drill, step, actor, { smooth: e.target.checked }))}
        />
        Smooth the corners into a curve
      </label>

      {planned && (
        <p className="hint">
          {pathLength(planned.path).toFixed(1)} ft · {planned.duration.toFixed(2)} s
          {slowest && ' · the slowest move: it sets how long this step lasts'}
        </p>
      )}
      <p className="hint">Drag a dot to reshape. Drag a ring to add a point. Double-click a dot to remove it.</p>

      <button type="button" className="danger" onClick={() => onEdit(deleteRoute(drill, step, actor))}>
        Delete route
      </button>
    </section>
  )
}
