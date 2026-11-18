import type { PlannedStep } from '../engine/plan'
import type { Drill } from '../engine/types'
import { CommitField } from './CommitField'
import { addStep, deleteStep, moveStep, renameStep } from './routes'

interface Props {
  drill: Drill
  planSteps: readonly PlannedStep[]
  /** The step being edited, or null for Setup. */
  view: number | null
  onView: (view: number | null) => void
  onEdit: (next: Drill) => void
}

/**
 * Setup (starting positions) and each step, with how long it lasts. The
 * length of a step is its slowest move, so seeing it here is how you balance
 * routes that should finish together.
 */
export function StepList({ drill, planSteps, view, onView, onEdit }: Props) {
  const current = view === null ? null : drill.steps[view]

  return (
    <section>
      <h3>Steps</h3>
      <ol className="steps-list">
        <li>
          <button type="button" className={view === null ? 'active' : undefined} onClick={() => onView(null)}>
            Setup
          </button>
        </li>
        {drill.steps.map((step, i) => (
          <li key={i}>
            <button type="button" className={view === i ? 'active' : undefined} onClick={() => onView(i)}>
              {i + 1}. {step.name ?? `Step ${i + 1}`}
              {planSteps[i] && <span className="muted"> {planSteps[i].duration.toFixed(1)} s</span>}
            </button>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => {
          onEdit(addStep(drill))
          onView(drill.steps.length)
        }}
      >
        Add step
      </button>

      {current && view !== null && (
        <div className="step-controls">
          <CommitField
            label="Step name"
            value={current.name ?? ''}
            placeholder={`Step ${view + 1}`}
            onCommit={(name) => onEdit(renameStep(drill, view, name))}
          />
          <div className="inline">
            <button
              type="button"
              disabled={view === 0}
              aria-label="Move step earlier"
              onClick={() => {
                onEdit(moveStep(drill, view, -1))
                onView(view - 1)
              }}
            >
              ↑ Earlier
            </button>
            <button
              type="button"
              disabled={view === drill.steps.length - 1}
              aria-label="Move step later"
              onClick={() => {
                onEdit(moveStep(drill, view, 1))
                onView(view + 1)
              }}
            >
              ↓ Later
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                onEdit(deleteStep(drill, view))
                onView(view > 0 ? view - 1 : drill.steps.length > 1 ? 0 : null)
              }}
            >
              Delete step
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
