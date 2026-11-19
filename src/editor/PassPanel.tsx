import { useMemo } from 'react'
import type { Drill, MoveStyle } from '../engine/types'
import type { Starts } from '../flow/edit'
import { drillToFlow } from '../flow/import'
import { clearBank, followers, removePass, setPassSpeed, setPassStyle } from '../flow/passEdit'
import { isAfter, type Flow } from '../flow/types'
import { buildTimelineModel } from '../flow/view'
import { CommitField } from './CommitField'
import { RELEASE_STYLES } from './releases'

interface Props {
  drill: Drill
  link: number
  onEdit: (edit: (flow: Flow, starts: Starts) => Flow | null) => void
}

/** The pass, shot or drop pass selected in the flow view. */
export function PassPanel({ drill, link, onEdit }: Props) {
  const info = useMemo(() => {
    const flow = drillToFlow(drill)
    const model = buildTimelineModel(drill)
    const event = flow?.events[link]
    const l = model?.links[link]
    if (!flow || !event || !l) return null
    return { flow, event, link: l, anchored: followers(flow, link).length > 0 }
  }, [drill, link])
  if (!info) return null
  const { event, link: l, anchored } = info
  const spot = event.target.kind === 'point'

  return (
    <section>
      <h3>
        {event.style === 'shoot' ? 'Shot' : event.style === 'drop-pass' ? 'Drop pass' : 'Pass'}: {l.from.actor}
        {l.to.actor ? ` to ${l.to.actor}` : ''}
      </h3>
      <p className="hint">
        Leaves {l.from.actor} at {l.from.t.toFixed(2)} s
        {isAfter(event.from) ? ' (as the puck arrives)' : ''}
        {l.to.actor ? `, lands on ${l.to.actor} at ${l.to.t.toFixed(2)} s` : `, in the air until ${l.to.t.toFixed(2)} s`}.
      </p>

      {event.target.via && event.target.via.length > 0 && (
        <p className="hint">
          Banked off the boards ({event.target.via.length} {event.target.via.length === 1 ? 'bounce' : 'bounces'}).{' '}
          <button type="button" onClick={() => onEdit((f) => clearBank(f, link))}>
            Make it straight
          </button>
        </p>
      )}

      <label className="field">
        <span>Style</span>
        <select value={event.style} onChange={(e) => onEdit((f) => setPassStyle(f, link, e.target.value as MoveStyle))}>
          {RELEASE_STYLES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      {spot ? (
        <CommitField
          label="Speed (ft/s)"
          value={event.speed === undefined ? '' : String(event.speed)}
          placeholder="default"
          onCommit={(text) => {
            const trimmed = text.trim()
            if (trimmed === '') onEdit((f) => setPassSpeed(f, link, null))
            else if (Number(trimmed) > 0) onEdit((f) => setPassSpeed(f, link, Number(trimmed)))
          }}
        />
      ) : (
        <p className="hint">
          Its speed is worked out from when it leaves and when {l.to.actor} gets there. Drag its ends on the timeline to change either.
        </p>
      )}

      <button type="button" className="danger" disabled={anchored} onClick={() => onEdit((f) => removePass(f, link))}>
        Delete this {event.style === 'shoot' ? 'shot' : 'pass'}
      </button>
      {anchored && <p className="hint">A shot is taken as this pass arrives. Delete that first.</p>}
    </section>
  )
}
