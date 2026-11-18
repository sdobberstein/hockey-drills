import type { ActorType } from '../engine/types'
import { ActorSymbol } from '../render/ActorSymbol'

const ITEMS: { type: ActorType; name: string; letter: string }[] = [
  { type: 'forward', name: 'Forward', letter: 'F' },
  { type: 'defender', name: 'Defender', letter: 'D' },
  { type: 'goalie', name: 'Goalie', letter: 'G' },
  { type: 'coach', name: 'Coach', letter: 'C' },
  { type: 'puck', name: 'Puck', letter: '' },
  { type: 'pucks', name: 'Pucks', letter: '' },
  { type: 'pylon', name: 'Pylon', letter: '' },
  { type: 'net', name: 'Net', letter: '' },
]

/** Buttons to add things to the ice. Click one, then click the ice to place it. */
export function Palette({ armed, onArm }: { armed: ActorType | null; onArm: (type: ActorType | null) => void }) {
  return (
    <section>
      <h3>Add to the ice</h3>
      <div className="palette">
        {ITEMS.map(({ type, name, letter }) => (
          <button
            key={type}
            type="button"
            aria-pressed={armed === type}
            className={armed === type ? 'active' : undefined}
            onClick={() => onArm(armed === type ? null : type)}
          >
            <svg viewBox="-4.5 -4.5 9 9" width="22" height="22" aria-hidden="true">
              <ActorSymbol actor={{ id: letter, type, start: [0, 0] }} />
            </svg>
            {name}
          </button>
        ))}
      </div>
      <p className="hint">{armed ? 'Click the ice to place it. Esc cancels.' : 'Drag anything on the ice to move it.'}</p>
    </section>
  )
}
