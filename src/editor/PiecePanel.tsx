import { useMemo } from 'react'
import type { Drill } from '../engine/types'
import { insertWait, removeWait, RUN_SPEED_LIMITS, setRunSeconds, setWaitSeconds, type Starts } from '../flow/edit'
import { removeRun, setRunLook } from '../flow/pathEdit'
import type { MoveStyle } from '../engine/types'
import { ROUTE_STYLES } from './routes'
import { drillToFlow } from '../flow/import'
import { segmentsFor } from '../flow/timeline'
import type { Flow } from '../flow/types'
import { CommitField } from './CommitField'

interface Props {
  drill: Drill
  actor: string
  piece: number
  /** Edit the drill by way of its flow. Resolves the edit, or says why it cannot be done. */
  onEdit: (edit: (flow: Flow, starts: Starts) => Flow | null) => void
}

/** The block selected on the timeline: a run or a wait. */
export function PiecePanel({ drill, actor, piece, onEdit }: Props) {
  const info = useMemo(() => {
    const flow = drillToFlow(drill)
    const start = drill.actors.find((a) => a.id === actor)?.start
    const list = flow?.paths[actor]
    if (!flow || !start || !list?.[piece]) return null
    const seg = segmentsFor(list, start)[piece]
    return { seg, label: drill.actors.find((a) => a.id === actor)?.label ?? actor }
  }, [drill, actor, piece])
  if (!info) return null

  const { seg } = info
  const seconds = seg.t1 - seg.t0

  if (seg.piece.kind === 'wait') {
    return (
      <section>
        <h3>
          {info.label} stands still <span className="muted">({seconds.toFixed(2)} s)</span>
        </h3>
        <CommitField
          label="For how long (seconds)"
          value={seconds.toFixed(2)}
          onCommit={(text) => {
            const n = Number(text)
            if (Number.isFinite(n) && n >= 0) onEdit((f, s) => setWaitSeconds(f, s, actor, piece, n))
          }}
        />
        <button type="button" onClick={() => onEdit((f, s) => removeWait(f, s, actor, piece))}>
          Remove this stop
        </button>
        <p className="hint">
          Anything that was waiting for {info.label} (a pass landing on them) now happens as soon as they finish before it. Drag the edge of the
          block on the timeline to change it by eye.
        </p>
      </section>
    )
  }

  return (
    <section>
      <h3>
        {info.label}: {seg.piece.style} <span className="muted">({seconds.toFixed(2)} s)</span>
      </h3>
      <CommitField
        label="Lasts (seconds)"
        value={seconds.toFixed(2)}
        onCommit={(text) => {
          const n = Number(text)
          if (n > 0) onEdit((f, s) => setRunSeconds(f, s, actor, piece, n))
        }}
      />
      <p className="hint">
        {seg.length.toFixed(1)} ft at {seg.speed.toFixed(1)} ft/s. A different time changes the speed (between {RUN_SPEED_LIMITS.minRunSpeed} and{' '}
        {RUN_SPEED_LIMITS.maxRunSpeed} ft/s), not where they go.
      </p>
      <label className="field">
        <span>Style</span>
        <select value={seg.piece.style} onChange={(e) => onEdit((f, s) => setRunLook(f, s, actor, piece, { style: e.target.value as MoveStyle }))}>
          {ROUTE_STYLES.map((style) => (
            <option key={style} value={style}>
              {style}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={seg.piece.smooth === true}
          onChange={(e) => onEdit((f, s) => setRunLook(f, s, actor, piece, { smooth: e.target.checked }))}
        />
        Smooth the corners into a curve
      </label>
      <button type="button" onClick={() => onEdit((f) => insertWait(f, actor, piece, 0.5))}>
        Pause before this run (0.5 s)
      </button>
      <button type="button" className="danger" onClick={() => onEdit((f, s) => removeRun(f, s, actor, piece))}>
        Delete this run
      </button>
      <p className="hint">Drag a dot on the ice to reshape. Drag a ring to add a point. Double-click a dot to remove it.</p>
    </section>
  )
}
