import type { Frame, Heading } from '../engine/timeline'
import type { Plan } from '../engine/plan'
import type { Drill } from '../engine/types'
import { ActorSymbol } from './ActorSymbol'
import { displayPosition } from './layout'
import { MoveLine } from './MoveLine'
import { Rink } from './Rink'
import { viewAspect, viewBoxFor } from './rinkGeometry'

interface Props {
  drill: Drill
  plan: Plan
  /** Where every actor is right now, from Timeline.at(t). */
  frame: Frame
  /** Step to draw at full strength; the others are faded. Null shows all equally. */
  activeStep: number | null
  /** Which way each skater is heading, so a carried puck is drawn out in front of them. */
  headings?: Readonly<Record<string, Heading>>
}

/**
 * The picture of a drill at one moment: rink, the route lines for every step
 * (the current one emphasised), and each actor at its position in `frame`.
 *
 * This component only draws. All timing lives in the engine, which is why
 * scrubbing and playback can share it.
 */
export function DrillView({ drill, plan, frame, activeStep, headings }: Props) {
  // Pucks are drawn last so they are never hidden under a player.
  const ordered = [...drill.actors].sort((a, b) => Number(a.type === 'puck') - Number(b.type === 'puck'))

  return (
    <svg
      viewBox={viewBoxFor(drill.rink)}
      role="img"
      aria-label={drill.title}
      // Fill the page width, but never grow taller than 70% of the window.
      // A half rink is nearly square, so at full width it would overflow the
      // screen. aspect-ratio lets the height follow whichever width we pick.
      style={{
        aspectRatio: viewAspect(drill.rink),
        width: `min(100%, calc(70vh * ${viewAspect(drill.rink)}))`,
        height: 'auto',
        margin: '0 auto',
      }}
    >
      <Rink />
      {plan.steps.map((step, si) =>
        step.moves.map((move, mi) => (
          <MoveLine
            key={`${si}-${mi}`}
            style={move.style}
            path={move.path}
            opacity={activeStep === null || activeStep === si ? 1 : 0.22}
          />
        )),
      )}
      {ordered.map((actor) => {
        const [x, y] = displayPosition(actor, frame, drill.actors, headings)
        return (
          <g key={actor.id} transform={`translate(${x} ${y})`}>
            <ActorSymbol actor={actor} />
          </g>
        )
      })}
    </svg>
  )
}
