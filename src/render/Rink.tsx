import { useId } from 'react'
import { hashMarks, RINK } from './rinkGeometry'

const RED = '#c8102e'
const BLUE = '#1f4fb5'

/**
 * The rink markings, drawn in feet. Rendered as a <g> so it can sit inside
 * any <svg> whose viewBox comes from viewBoxFor().
 */
export function Rink() {
  // A unique id per instance, so two rinks on one page do not share a clip.
  const clipId = useId()
  const { length, width, cornerRadius, goalLineX, blueLineX, centerX, centerY } = RINK
  const farGoalX = length - goalLineX
  const farBlueX = length - blueLineX
  const dotsY = [centerY - RINK.dotOffsetY, centerY + RINK.dotOffsetY]
  const endDotsX = [RINK.endZoneDotX, length - RINK.endZoneDotX]
  const netY = centerY - RINK.netWidth / 2

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect width={length} height={width} rx={cornerRadius} />
        </clipPath>
      </defs>

      <rect width={length} height={width} rx={cornerRadius} fill="var(--rink-ice)" />

      {/* Lines are drawn full-height and clipped to the rounded outline. */}
      <g clipPath={`url(#${clipId})`}>
        <rect x={centerX - 0.5} width={1} height={width} fill={RED} />
        {[blueLineX, farBlueX].map((x) => (
          <rect key={x} x={x - 0.5} width={1} height={width} fill={BLUE} />
        ))}
        {[goalLineX, farGoalX].map((x) => (
          <rect key={x} x={x - 0.15} width={0.3} height={width} fill={RED} />
        ))}
      </g>

      {/* Faceoff circles and dots. */}
      <circle cx={centerX} cy={centerY} r={RINK.faceoffRadius} fill="none" stroke={BLUE} strokeWidth={0.3} />
      <circle cx={centerX} cy={centerY} r={0.6} fill={BLUE} />
      {endDotsX.flatMap((x) =>
        dotsY.map((y) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} r={RINK.faceoffRadius} fill="none" stroke={RED} strokeWidth={0.3} />
            <circle cx={x} cy={y} r={1} fill={RED} />
            {/* The hash marks, just outside the circle at its top and bottom. */}
            {hashMarks(x, y).map(([x1, y1, x2, y2], i) => (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={RED} strokeWidth={0.3} />
            ))}
          </g>
        )),
      )}
      {[RINK.neutralDotX, length - RINK.neutralDotX].flatMap((x) =>
        dotsY.map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1} fill={RED} />),
      )}

      {/* Creases: a half-disc facing the ice. sweep-flag 1 bulges toward the
          centre of the rink on both ends (both arcs run clockwise on screen). */}
      <path
        d={`M ${goalLineX} ${centerY - RINK.creaseRadius} A ${RINK.creaseRadius} ${RINK.creaseRadius} 0 0 1 ${goalLineX} ${centerY + RINK.creaseRadius} Z`}
        fill="var(--rink-crease)"
        stroke={RED}
        strokeWidth={0.3}
      />
      <path
        d={`M ${farGoalX} ${centerY + RINK.creaseRadius} A ${RINK.creaseRadius} ${RINK.creaseRadius} 0 0 1 ${farGoalX} ${centerY - RINK.creaseRadius} Z`}
        fill="var(--rink-crease)"
        stroke={RED}
        strokeWidth={0.3}
      />

      {/* Nets sit behind the goal line. */}
      <rect x={goalLineX - RINK.netDepth} y={netY} width={RINK.netDepth} height={RINK.netWidth} fill="none" stroke={RED} strokeWidth={0.4} />
      <rect x={farGoalX} y={netY} width={RINK.netDepth} height={RINK.netWidth} fill="none" stroke={RED} strokeWidth={0.4} />

      {/* Boards. */}
      <rect width={length} height={width} rx={cornerRadius} fill="none" stroke="var(--rink-boards)" strokeWidth={0.8} />
    </g>
  )
}
