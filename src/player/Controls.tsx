import type { Plan } from '../engine/plan'
import type { Playback } from './usePlayback'

const RATES = [0.25, 0.5, 1, 2]

interface Props {
  plan: Plan
  playback: Playback
  activeStep: number
}

/** Transport controls: play/pause, a scrubber, speed, and jump-to-step chips. */
export function Controls({ plan, playback, activeStep }: Props) {
  const { time, playing, rate, toggle, seek, setRate } = playback

  return (
    <div className="controls">
      <div className="transport">
        <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          aria-label="Time"
          min={0}
          max={plan.duration}
          step={0.01}
          value={time}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span className="clock">
          {time.toFixed(1)} / {plan.duration.toFixed(1)} s
        </span>
        <label>
          Speed{' '}
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))}>
            {RATES.map((r) => (
              <option key={r} value={r}>
                {r}x
              </option>
            ))}
          </select>
        </label>
      </div>

      <ol className="steps">
        {plan.steps.map((step, i) => (
          <li key={i}>
            <button type="button" className={i === activeStep ? 'active' : undefined} onClick={() => seek(step.start)}>
              {i + 1}. {step.name ?? `Step ${i + 1}`}
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
