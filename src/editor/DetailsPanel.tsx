import type { Drill, RinkView } from '../engine/types'
import { CommitField } from './CommitField'
import { parseTags, setDetails } from './ops'

const VIEWS: { value: RinkView; name: string }[] = [
  { value: 'full', name: 'Full rink' },
  { value: 'half-right', name: 'Half: right' },
  { value: 'half-left', name: 'Half: left' },
  { value: 'half-top', name: 'Half: top' },
  { value: 'half-bottom', name: 'Half: bottom' },
]

/** The drill's title, description, tags and the part of the rink shown. */
export function DetailsPanel({ drill, onEdit }: { drill: Drill; onEdit: (next: Drill) => void }) {
  return (
    <section>
      <h3>Drill</h3>
      <CommitField label="Title" value={drill.title} onCommit={(title) => onEdit(setDetails(drill, { title }))} />
      <CommitField
        label="Description"
        multiline
        value={drill.description ?? ''}
        onCommit={(description) => onEdit(setDetails(drill, { description }))}
      />
      <CommitField
        label="Tags (comma separated)"
        value={(drill.tags ?? []).join(', ')}
        onCommit={(text) => onEdit(setDetails(drill, { tags: parseTags(text) }))}
      />
      <label className="field">
        <span>Rink view</span>
        <select value={drill.rink} onChange={(e) => onEdit(setDetails(drill, { rink: e.target.value as RinkView }))}>
          {VIEWS.map((v) => (
            <option key={v.value} value={v.value}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">
        Id: <code>{drill.id}</code>
      </p>
    </section>
  )
}
