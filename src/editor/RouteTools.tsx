import type { MoveStyle } from '../engine/types'
import { MoveLine } from '../render/MoveLine'
import { RELEASE_STYLES } from './releases'
import { ROUTE_STYLES } from './routes'

const NAMES: Record<string, string> = {
  skate: 'Skate',
  'skate-puck': 'Skate with puck',
  backward: 'Backward',
  lateral: 'Lateral',
  pivot: 'Pivot',
  stop: 'Stop',
  check: 'Check',
  pass: 'Pass',
  shoot: 'Shot',
  'drop-pass': 'Drop pass',
}

interface Props {
  armed: MoveStyle | null
  drawing: boolean
  onArm: (style: MoveStyle | null) => void
}

function StyleButtons({ styles, armed, onArm }: { styles: readonly MoveStyle[]; armed: MoveStyle | null; onArm: Props['onArm'] }) {
  return (
    <div className="routes">
      {styles.map((style) => (
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
  )
}

/** Choose a line style, then click an actor and click out its route. */
export function RouteTools({ armed, drawing, onArm }: Props) {
  const releasing = armed !== null && RELEASE_STYLES.includes(armed)
  return (
    <>
      <section>
        <h3>Draw a route</h3>
        <StyleButtons styles={ROUTE_STYLES} armed={armed} onArm={onArm} />
      </section>
      <section>
        <h3>Pass or shoot</h3>
        <StyleButtons styles={RELEASE_STYLES} armed={armed} onArm={onArm} />
        <p className="hint">
          {drawing
            ? releasing
              ? 'Click where it goes, or click a teammate. Click several points to bank it off the boards, then double-click.'
              : 'Click to add points. Double-click or press Enter to finish. Esc cancels.'
            : armed
              ? releasing
                ? 'Now click the player with the puck.'
                : 'Now click the player to start from.'
              : 'Pick a style, then click the player.'}
        </p>
      </section>
    </>
  )
}
