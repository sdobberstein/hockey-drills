import { useMemo } from 'react'
import type { Drill } from '../engine/types'
import { applyPassSpeedFix, continueSkating, extendRoute, findWaits, passSpeedFix } from './waiting'

interface Props {
  drill: Drill
  onEdit: (next: Drill) => void
  /** Jump to the step and select the move, so you can see what is being described. */
  onShow: (step: number, actor: string) => void
}

/**
 * Where a skater stops and starts. These are hints, not errors: a drill with a
 * deliberate pause is still a valid drill. Each comes with a fix that keeps
 * the skater moving.
 */
export function SmoothnessPanel({ drill, onEdit, onShow }: Props) {
  const waits = useMemo(() => findWaits(drill), [drill])
  if (waits.length === 0) return null

  return (
    <section className="smooth">
      <h3>Smooth skating</h3>
      <ul>
        {waits.map((w) => {
          const speedFix = w.kind === 'early' ? passSpeedFix(drill, w) : null
          return (
            <li key={`${w.step}-${w.actor}-${w.kind}`}>
              <button type="button" className="linklike" onClick={() => onShow(w.step, w.actor)}>
                Step {w.step + 1}: {w.actor}
              </button>{' '}
              {w.kind === 'early'
                ? `stops for ${w.idle.toFixed(2)} s before the step ends.`
                : `stands still for ${w.idle.toFixed(2)} s after skating in the step before.`}
              <span className="apply">
                <button
                  type="button"
                  onClick={() => onEdit(w.kind === 'early' ? extendRoute(drill, w.step, w.actor) : continueSkating(drill, w.step, w.actor))}
                >
                  Keep {w.actor} skating
                </button>
                {speedFix && (
                  <button type="button" onClick={() => onEdit(applyPassSpeedFix(drill, w.step, speedFix))}>
                    Speed the pass to {speedFix.speed.toFixed(1)} ft/s
                  </button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="hint">Hints only. A step lasts as long as its slowest move, so anyone who finishes sooner stands waiting.</p>
    </section>
  )
}
