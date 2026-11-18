import type { MoveStyle } from '../engine/types'
import { MoveLine } from '../render/MoveLine'
import { ROUTE_STYLES } from './routes'

const NAMES: Record<string, string> = {
  skate: 'Skate',
  'skate-puck': 'Skate with puck',
  backward: 'Backward',
  lateral: 'Lateral',
  pivot: 'Pivot',
  stop: 'Stop',
  check: 'Check',
}

interface Props {
  armed: MoveStyle | null
  drawing: boolean
  onArm: (style: MoveStyle | null) => void
}

/** Choose a line style, then click an actor and click out its route. */
export function RouteTools({ armed, drawing, onArm }: Props) {
  return (
    <section>
      <h3>Draw a route</h3>
      <div className="routes">
        {ROUTE_STYLES.map((style) => (
          <button
            key={style}
            type="button"
            aria-pressed={armed === style}
            className={armed === style ? 'active' : undefined}
            onClick={() => onArm(armed === style ? null : style)}
          >
            <svg viewBox="-1 -4 22 8" width="40" height="16" aria-hidden="true">
              <MoveLine style={style} path={[[0, 0], [19, 0]]} />
            </svg>
            {NAMES[style] ?? style}
          </button>
        ))}
      </div>
      <p className="hint">
        {drawing
          ? 'Click to add points. Double-click or press Enter to finish. Esc cancels.'
          : armed
            ? 'Now click the player to start from.'
            : 'Pick a style, click a player, then click along the route.'}
      </p>
    </section>
  )
}
