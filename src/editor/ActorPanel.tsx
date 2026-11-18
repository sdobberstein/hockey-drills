import type { Actor, Drill } from '../engine/types'
import { CommitField } from './CommitField'
import { deleteActor, setActorLook, setCarrier } from './ops'

interface Props {
  drill: Drill
  actor: Actor
  onEdit: (next: Drill) => void
}

/** Properties of the selected actor. */
export function ActorPanel({ drill, actor, onEdit }: Props) {
  // Anyone who is not a puck and is not themselves carried can carry a puck.
  const carriers = drill.actors.filter((a) => a.type !== 'puck' && !a.carriedBy)

  return (
    <section>
      <h3>
        {actor.id} <span className="muted">({actor.type})</span>
      </h3>

      <CommitField
        label="Label"
        value={actor.label ?? ''}
        placeholder={actor.id}
        onCommit={(label) => onEdit(setActorLook(drill, actor.id, { label }))}
      />

      {actor.type !== 'puck' && actor.type !== 'pucks' && actor.type !== 'pylon' && actor.type !== 'net' && (
        <label className="field">
          <span>Colour</span>
          <span className="inline">
            <input
              type="color"
              value={actor.color ?? '#111111'}
              onChange={(e) => onEdit(setActorLook(drill, actor.id, { color: e.target.value }))}
            />
            {actor.color && (
              <button type="button" onClick={() => onEdit(setActorLook(drill, actor.id, { color: '' }))}>
                Clear
              </button>
            )}
          </span>
        </label>
      )}

      {actor.type === 'puck' && (
        <label className="field">
          <span>Carried by</span>
          <select
            value={actor.carriedBy ?? ''}
            onChange={(e) => onEdit(setCarrier(drill, actor.id, e.target.value || undefined))}
          >
            <option value="">Nobody (loose)</option>
            {carriers.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label ?? a.id}
              </option>
            ))}
          </select>
        </label>
      )}

      {actor.carriedBy && <p className="hint">Carried pucks move with their carrier. Drag {actor.carriedBy} instead.</p>}

      <button type="button" className="danger" onClick={() => onEdit(deleteActor(drill, actor.id))}>
        Delete {actor.id}
      </button>
    </section>
  )
}
