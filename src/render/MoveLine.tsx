import type { MoveStyle, Point } from '../engine/types'
import { lineArt } from './lineGeometry'

/** Draws one move as International Drill Symbols line art. */
export function MoveLine({
  style,
  path,
  opacity = 1,
  arrow = true,
}: {
  style: MoveStyle
  path: readonly Point[]
  opacity?: number
  /** Draw the arrowhead (forward skating only); off for a stretch in the middle of a longer run. */
  arrow?: boolean
}) {
  return (
    <g opacity={opacity} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {lineArt(style, path, { arrow }).map((stroke, i) => (
        <polyline
          key={i}
          points={stroke.points.map(([x, y]) => `${x},${y}`).join(' ')}
          stroke={stroke.knockout ? 'var(--rink-ice)' : 'var(--ink)'}
          strokeWidth={stroke.width}
          strokeDasharray={stroke.dash}
        />
      ))}
    </g>
  )
}
