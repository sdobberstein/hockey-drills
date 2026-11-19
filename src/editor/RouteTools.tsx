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
  /** Show the pass and shot tools. The flow view has no passes to draw yet. */
  releases?: boolean
  /** The drill has no puck, so a pass or shot has nothing to act on: say so next to the tools. */
  noPuck?: boolean
  /** Describe the second click: in the flow view a run is added to the end of a skater's path. */
  flow?: boolean
  /** The pickup tool (flow view only): is it chosen, has a puck been chosen, and a way to turn it on or off. */
  pickup?: { armed: boolean; puckChosen: boolean; onToggle: () => void }
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
export function RouteTools({ armed, drawing, onArm, releases = true, flow = false, noPuck = false, pickup }: Props) {
  const releasing = armed !== null && RELEASE_STYLES.includes(armed)
  return (
    <>
      <section>
        <h3>Draw a route</h3>
        {/* In the flow view forward skating is drawn with the puck by itself while the skater has it, so there is nothing to choose. */}
        <StyleButtons styles={flow ? ROUTE_STYLES.filter((s) => s !== 'skate-puck') : ROUTE_STYLES} armed={armed} onArm={onArm} />
      </section>
      {pickup && (
        <section>
          <h3>Pick up a loose puck</h3>
          <div className="routes">
            <button type="button" aria-pressed={pickup.armed} className={pickup.armed ? 'active' : undefined} onClick={pickup.onToggle}>
              Pick up
            </button>
          </div>
          <p className="hint">
            {!pickup.armed
              ? 'For a dump-in: pass or shoot the puck to a spot with nobody receiving it, then have a skater run there. Choose this, then click the loose puck.'
              : pickup.puckChosen
                ? 'Green marks where on the skaters\' paths they can reach it. Click in the green. Esc cancels.'
                : 'Click the loose puck (the orange ring). Esc cancels.'}
          </p>
        </section>
      )}
      {releases ? (
        <section>
          <h3>Pass or shoot</h3>
          {noPuck && (
            <p className="notice" role="note">
              There is no puck in this drill yet, so there is nothing to pass or shoot.{' '}
              {flow
                ? 'Add a puck under “Add to the ice” and set who carries it.'
                : '“Skate with puck” is only a line style: add a puck under “Add to the ice” and set who carries it.'}
            </p>
          )}
          <StyleButtons styles={RELEASE_STYLES} armed={armed} onArm={onArm} />
          <p className="hint">
            {flow
              ? drawing
                ? 'Green marks where on the other paths it can land. Click in the green, or near it. Click elsewhere on the ice for a loose pass. To bank it, Shift-click near a wall first (once per bounce). Esc cancels.'
                : armed
                  ? 'Click the passer\'s path where the pass leaves, or click the passer to pass from where they first have the puck.'
                  : 'Pick a style, then click a path.'
              : drawing
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
      ) : (
        <p className="hint">
          {drawing
            ? 'Click to add points. Double-click or press Enter to finish. Esc cancels.'
            : armed
              ? flow
                ? 'Now click the skater. The run is added to the end of their path.'
                : 'Now click the player to start from.'
              : 'Pick a style, then click a skater.'}
        </p>
      )}
    </>
  )
}
