import { useMemo, useRef } from 'react'
import { initialState, planDrill } from '../engine/plan'
import type { ActorType, Drill, Point } from '../engine/types'
import { ActorSymbol } from '../render/ActorSymbol'
import { displayPosition } from '../render/layout'
import { MoveLine } from '../render/MoveLine'
import { Rink } from '../render/Rink'
import { viewAspect, viewBoxFor } from '../render/rinkGeometry'

interface Props {
  drill: Drill
  selected: string | null
  /** When set, the next click on the ice places an actor of this type. */
  armed: ActorType | null
  onSelect: (id: string | null) => void
  onPlace: (at: Point) => void
  /** The actor is being dragged to this spot (no undo step yet). */
  onDrag: (id: string, to: Point) => void
  onDragEnd: () => void
}

/** How far around an actor a click still grabs it, in feet. Bigger than the symbol, for fingers. */
const GRAB_RADIUS = 4

/**
 * The editable picture of a drill: the rink, the routes already drawn, and
 * every actor at its starting position, which you can select and drag.
 *
 * Positions come from the screen via the SVG's own transform, so dragging
 * works the same at any zoom or window size, and a half-rink crop needs no
 * special handling: coordinates are always full-rink feet.
 */
export function EditStage({ drill, selected, armed, onSelect, onPlace, onDrag, onDragEnd }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  // Where, relative to the pointer, the actor was grabbed, so it does not jump.
  const grab = useRef<{ id: string; dx: number; dy: number } | null>(null)

  // A drill being built may have steps that do not plan cleanly; show the
  // actors regardless of whether the routes can be drawn.
  const { positions, steps } = useMemo(() => {
    const start = initialState(drill)
    try {
      return { positions: start.positions, steps: planDrill(drill).steps }
    } catch {
      return { positions: start.positions, steps: [] }
    }
  }, [drill])
  const frame = useMemo(() => Object.fromEntries(positions), [positions])

  const toFeet = (e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current!
    const point = svg.createSVGPoint()
    point.x = e.clientX
    point.y = e.clientY
    const p = point.matrixTransform(svg.getScreenCTM()!.inverse())
    return [p.x, p.y]
  }

  const ordered = [...drill.actors].sort((a, b) => Number(a.type === 'puck') - Number(b.type === 'puck'))
  const aspect = viewAspect(drill.rink)

  return (
    <svg
      ref={svgRef}
      viewBox={viewBoxFor(drill.rink)}
      role="application"
      aria-label={`Editing ${drill.title}`}
      className={armed ? 'stage armed' : 'stage'}
      style={{ aspectRatio: aspect, width: `min(100%, calc(70vh * ${aspect}))` }}
      onPointerDown={(e) => {
        // Reached only for clicks on empty ice; actors stop the event.
        if (armed) onPlace(toFeet(e))
        else onSelect(null)
      }}
    >
      <Rink />
      {steps.map((step, si) =>
        step.moves.map((move, mi) => (
          <MoveLine key={`${si}-${mi}`} style={move.style} path={move.path} opacity={0.45} />
        )),
      )}
      {ordered.map((actor) => {
        const [x, y] = displayPosition(actor, frame, drill.actors)
        const carried = actor.carriedBy !== undefined
        return (
          <g
            key={actor.id}
            transform={`translate(${x} ${y})`}
            className={carried ? 'actor carried' : 'actor'}
            onPointerDown={(e) => {
              e.stopPropagation()
              onSelect(actor.id)
              if (carried || armed) return
              const [px, py] = toFeet(e)
              grab.current = { id: actor.id, dx: x - px, dy: y - py }
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              if (grab.current?.id !== actor.id) return
              const [px, py] = toFeet(e)
              onDrag(actor.id, [px + grab.current.dx, py + grab.current.dy])
            }}
            onPointerUp={() => {
              if (grab.current?.id !== actor.id) return
              grab.current = null
              onDragEnd()
            }}
            onPointerCancel={() => {
              grab.current = null
              onDragEnd()
            }}
          >
            {selected === actor.id && (
              <circle r={GRAB_RADIUS - 0.4} fill="none" stroke="var(--accent)" strokeWidth={0.5} strokeDasharray="1.2 0.9" />
            )}
            <ActorSymbol actor={actor} />
            {/* An invisible, larger target so small things (a puck) are easy to grab. */}
            <circle r={GRAB_RADIUS} fill="transparent" />
          </g>
        )
      })}
    </svg>
  )
}
