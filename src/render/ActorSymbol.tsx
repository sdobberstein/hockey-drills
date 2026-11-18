import type { Actor } from '../engine/types'

const INK = '#111'
const RADIUS = 2.6

/**
 * One actor in International Drill Symbols notation, centred on (0, 0) so the
 * caller positions it with a transform.
 *
 * Forwards are circles, defenders triangles, and the coach a circled C.
 * Labels default to the actor id so players are identifiable in a diagram.
 */
export function ActorSymbol({ actor }: { actor: Actor }) {
  const label = actor.label ?? actor.id
  const fill = actor.color ?? INK

  switch (actor.type) {
    case 'forward':
      return (
        <g>
          <circle r={RADIUS} fill={fill} />
          <Label text={label} color="#fff" />
        </g>
      )
    case 'defender': {
      // Equilateral triangle, centred on its centroid so the label fits.
      const h = RADIUS * 1.9
      const points = `0,${-h * 0.62} ${h * 0.55},${h * 0.38} ${-h * 0.55},${h * 0.38}`
      return (
        <g>
          <polygon points={points} fill={fill} />
          <Label text={label} color="#fff" dy={0.7} />
        </g>
      )
    }
    case 'goalie':
      return <Label text="G" color={INK} size={4} />
    case 'coach':
      return (
        <g>
          <circle r={RADIUS} fill="#fff" stroke={INK} strokeWidth={0.4} />
          <Label text="C" color={INK} />
        </g>
      )
    case 'puck':
      return <circle r={0.9} fill={INK} stroke="#fff" strokeWidth={0.25} />
    case 'pucks':
      // A scatter of dots for the "cluster of pucks" symbol.
      return (
        <g fill={INK}>
          {[[-1.6, -1], [0, -1.8], [1.6, -0.8], [-0.8, 0.6], [0.9, 0.9], [-1.8, 1.8], [0.2, 2], [2, 2]].map(([x, y]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r={0.55} />
          ))}
        </g>
      )
    case 'pylon':
      return (
        <path d="M -1.4 -1.4 L 1.4 1.4 M 1.4 -1.4 L -1.4 1.4" stroke={INK} strokeWidth={0.6} strokeLinecap="round" />
      )
    case 'net':
      return <rect x={-1} y={-3} width={2} height={6} fill="none" stroke="#c8102e" strokeWidth={0.4} />
  }
}

function Label({ text, color, size = 2.4, dy = 0 }: { text: string; color: string; size?: number; dy?: number }) {
  return (
    <text
      textAnchor="middle"
      dominantBaseline="central"
      y={dy}
      fontSize={size}
      fontWeight={700}
      fontFamily="system-ui, sans-serif"
      fill={color}
    >
      {text}
    </text>
  )
}
