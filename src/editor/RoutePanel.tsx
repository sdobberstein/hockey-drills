import { pathLength } from '../engine/geometry'
import type { PlannedMove } from '../engine/plan'
import type { Drill, MoveStyle } from '../engine/types'
import { CommitField } from './CommitField'
import { deleteMove, findMove, isRelease, RELEASE_STYLES, retimePass, tieToRunEnd, updateRelease } from './releases'
import { ROUTE_STYLES, updateRoute } from './routes'

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

/** Properties of the selected move: a route, or a pass, shot or drop pass. */
export function RoutePanel({ drill, step, actor, planned, stepDuration, onEdit }: Props) {
  const move = findMove(drill, step, actor)
  if (!move) return null

  const release = isRelease(move)
  const slowest = planned !== undefined && stepDuration > 0 && planned.duration >= stepDuration - 1e-9
  const receiver = move.receiver ?? (typeof move.to === 'string' ? move.to : '')
  const straight = !move.points || move.points.length === 2

  const setStyle = (style: MoveStyle) =>
    onEdit(release ? updateRelease(drill, step, actor, { style }) : updateRoute(drill, step, actor, { style }))
  const setSpeed = (speed: number | null) =>
    onEdit(release ? updateRelease(drill, step, actor, { speed }) : updateRoute(drill, step, actor, { speed }))

  return (
    <section>
      <h3>
        {release ? 'Release' : 'Route'}: {actor} <span className="muted">(step {step + 1})</span>
      </h3>

      <label className="field">
        <span>Style</span>
        <select value={move.style} onChange={(e) => setStyle(e.target.value as MoveStyle)}>
          {(release ? RELEASE_STYLES : ROUTE_STYLES).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <CommitField
        label="Speed (ft/s)"
        value={move.speed === undefined ? '' : String(move.speed)}
        placeholder={planned ? `${planned.speed} (default)` : 'default'}
        onCommit={(text) => {
          const trimmed = text.trim()
          if (trimmed === '') setSpeed(null)
          else if (Number(trimmed) > 0) setSpeed(Number(trimmed))
        }}
      />

      {!release && (
        <label className="check">
          <input
            type="checkbox"
            checked={move.smooth === true}
            onChange={(e) => onEdit(updateRoute(drill, step, actor, { smooth: e.target.checked }))}
          />
          Smooth the corners into a curve
        </label>
      )}

      {release && (
        <>
          <label className="field">
            <span>Picked up by</span>
            <select
              value={receiver}
              onChange={(e) => onEdit(updateRelease(drill, step, actor, { receiver: e.target.value || null }))}
            >
              <option value="">Nobody (loose)</option>
              {drill.actors
                .filter((a) => a.type !== 'puck')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label ?? a.id}
                  </option>
                ))}
            </select>
          </label>
          {receiver && straight && (
            <div className="stack">
              <button type="button" onClick={() => onEdit(tieToRunEnd(drill, step, actor))}>
                Land at the end of {receiver}'s run
              </button>
              <button type="button" onClick={() => onEdit(retimePass(drill, step, actor))}>
                Meet {receiver} along the run (keep pass speed)
              </button>
            </div>
          )}
          <p className="hint">
            {typeof move.to === 'string'
              ? `Aimed at ${move.to}.`
              : move.points
                ? 'A bank: drag the dots to shape it.'
                : 'Drag the dot to move where it lands.'}
            {' '}“Land at the end” sets the pass speed so the puck arrives as they finish their run.
          </p>
        </>
      )}

      {planned && (
        <p className="hint">
          {pathLength(planned.path).toFixed(1)} ft · {planned.duration.toFixed(2)} s
          {slowest && ' · the slowest move: it sets how long this step lasts'}
        </p>
      )}
      {!release && <p className="hint">Drag a dot to reshape. Drag a ring to add a point. Double-click a dot to remove it.</p>}

      <button type="button" className="danger" onClick={() => onEdit(deleteMove(drill, step, actor))}>
        Delete {release ? 'release' : 'route'}
      </button>
    </section>
  )
}
