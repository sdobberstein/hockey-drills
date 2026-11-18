import { useMemo, useRef, useState } from 'react'
import type { PlannedStep } from '../engine/plan'
import type { ActorType, Drill, Point } from '../engine/types'
import { ActorSymbol } from '../render/ActorSymbol'
import { displayPosition } from '../render/layout'
import { MoveLine } from '../render/MoveLine'
import { Rink } from '../render/Rink'
import { viewAspect, viewBoxFor } from '../render/rinkGeometry'
import { findMove } from './releases'
import { findRoute } from './routes'
import type { Drawing, Selection } from './selection'

interface Props {
  drill: Drill
  /** The step being edited, or null for Setup (starting positions). */
  step: number | null
  /** Where each actor is shown: its start in Setup, or where it is when `step` begins. */
  positions: Record<string, Point>
  /** The resolved routes, for drawing the lines (curves included). */
  planSteps: readonly PlannedStep[]
  selection: Selection
  /** When set, the next click on the ice places an actor of this type. */
  armed: ActorType | null
  /** A route style is chosen: clicking an actor starts a route for it. */
  routeTool: boolean
  drawing: Drawing | null
  onSelect: (selection: Selection) => void
  onPlace: (at: Point) => void
  onActorDrag: (id: string, to: Point) => void
  onActorDragEnd: () => void
  onRouteStart: (actor: string, from: Point) => void
  /** A click while drawing. `onActor` is set if the click landed on an actor. */
  onDrawPoint: (at: Point, onActor?: string) => void
  onFinishDrawing: () => void
  onVertexDrag: (index: number, to: Point) => void
  /** The landing handle of a pass aimed at a point is being dragged. */
  onLandingDrag: (to: Point) => void
  onVertexInsert: (afterIndex: number, at: Point) => void
  onVertexRemove: (index: number) => void
  onVertexDragEnd: () => void
}

/** How far around an actor a click still grabs it, in feet. Bigger than the symbol, for fingers. */
const GRAB_RADIUS = 4
const ACCENT = 'var(--accent)'

/**
 * The editable picture of a drill. In Setup you place and drag actors; in a
 * step you draw routes and reshape them by their handles.
 *
 * Positions come from the screen via the SVG's own transform, so dragging
 * works at any zoom or window size, and a half-rink crop needs no special
 * handling: coordinates are always full-rink feet.
 */
export function EditStage(props: Props) {
  const { drill, step, positions, planSteps, selection, armed, routeTool, drawing } = props
  const svgRef = useRef<SVGSVGElement>(null)
  // Where, relative to the pointer, an actor was grabbed, so it does not jump.
  const grab = useRef<{ id: string; dx: number; dy: number } | null>(null)
  // Which vertex of the selected route is being dragged. The svg itself holds
  // the pointer capture, because handles can appear and disappear mid-drag.
  const vertexDrag = useRef<number | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)

  const toFeet = (e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current!
    const point = svg.createSVGPoint()
    point.x = e.clientX
    point.y = e.clientY
    const p = point.matrixTransform(svg.getScreenCTM()!.inverse())
    return [p.x, p.y]
  }

  const selectedRoute = useMemo(
    () => (selection?.kind === 'route' && selection.step === step ? findRoute(drill, selection.step, selection.actor) : undefined),
    [drill, selection, step],
  )
  // A pass or shot aimed at a point or a teammate has no waypoints, only an end: its landing.
  const selectedMove = selection?.kind === 'route' && selection.step === step ? findMove(drill, selection.step, selection.actor) : undefined
  const selectedPath =
    selectedMove && step !== null ? planSteps[step]?.moves.find((m) => m.actor === selectedMove.actor)?.path : undefined
  const landing = selectedMove && !selectedMove.points && selectedPath ? selectedPath[selectedPath.length - 1] : undefined

  const frame = positions
  const ordered = [...drill.actors].sort((a, b) => Number(a.type === 'puck') - Number(b.type === 'puck'))
  const aspect = viewAspect(drill.rink)
  const busy = drawing !== null || armed !== null || routeTool

  // -1 stands for the landing handle rather than a waypoint.
  const LANDING = -1
  const startVertexDrag = (e: React.PointerEvent, index: number) => {
    e.stopPropagation()
    svgRef.current!.setPointerCapture(e.pointerId)
    vertexDrag.current = index
  }

  return (
    <svg
      ref={svgRef}
      viewBox={viewBoxFor(drill.rink)}
      role="application"
      aria-label={`Editing ${drill.title}`}
      className={armed || drawing ? 'stage armed' : 'stage'}
      style={{ aspectRatio: aspect, width: `min(100%, calc(70vh * ${aspect}))` }}
      onPointerDown={(e) => {
        // Reached only for clicks on empty ice; actors and handles stop the event.
        if (drawing) props.onDrawPoint(toFeet(e))
        else if (armed) props.onPlace(toFeet(e))
        else props.onSelect(null)
      }}
      onPointerMove={(e) => {
        if (vertexDrag.current === LANDING) props.onLandingDrag(toFeet(e))
        else if (vertexDrag.current !== null) props.onVertexDrag(vertexDrag.current, toFeet(e))
        else if (drawing) setCursor(toFeet(e))
      }}
      onPointerUp={() => {
        if (vertexDrag.current === null) return
        vertexDrag.current = null
        props.onVertexDragEnd()
      }}
      onDoubleClick={() => {
        if (drawing) props.onFinishDrawing()
      }}
    >
      <Rink />

      {/* Routes. In a step the current one is strong and the rest are faint context. */}
      {planSteps.map((planned, si) =>
        planned.moves.map((move, mi) => (
          <MoveLine
            key={`${si}-${mi}`}
            style={move.style}
            path={move.path}
            opacity={step === null ? 0.45 : si === step ? 1 : 0.18}
          />
        )),
      )}

      {/* A halo under the selected route. */}
      {selectedPath && (
        <polyline
          points={selectedPath.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke={ACCENT}
          strokeOpacity={0.25}
          strokeWidth={3}
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}

      {/* Invisible wide targets so a thin route line is easy to click. */}
      {step !== null &&
        planSteps[step]?.moves.map((move) => (
          <polyline
            key={move.actor}
            points={move.path.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="none"
            stroke="transparent"
            strokeWidth={3.5}
            strokeLinejoin="round"
            // Inert only while drawing, when clicks must add points. With a tool merely
            // armed they still select, so you can always reach an existing move.
            pointerEvents={drawing ? 'none' : 'stroke'}
            style={{ cursor: 'pointer' }}
            onPointerDown={(e) => {
              e.stopPropagation()
              props.onSelect({ kind: 'route', step, actor: move.actor })
            }}
          />
        ))}

      {/* The route being drawn, with a dashed line to where the pointer is. */}
      {drawing && (
        <g pointerEvents="none" fill="none" stroke={ACCENT} strokeWidth={0.5} strokeLinecap="round">
          <polyline points={drawing.points.map(([x, y]) => `${x},${y}`).join(' ')} />
          {cursor && (
            <line
              x1={drawing.points[drawing.points.length - 1][0]}
              y1={drawing.points[drawing.points.length - 1][1]}
              x2={cursor[0]}
              y2={cursor[1]}
              strokeDasharray="1.2 0.9"
            />
          )}
          {drawing.points.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={0.9} fill={ACCENT} stroke="none" />
          ))}
        </g>
      )}

      {/* The landing handle of a pass or shot aimed at a point or a teammate. */}
      {landing && (
        <circle
          cx={landing[0]}
          cy={landing[1]}
          r={1.6}
          fill={ACCENT}
          stroke="#fff"
          strokeWidth={0.4}
          style={{ cursor: 'grab' }}
          onPointerDown={(e) => startVertexDrag(e, LANDING)}
        />
      )}

      {/* Handles for the selected route: drag to reshape, drag a "+" to add a point, double-click to remove one. */}
      {selectedRoute && (
        <g>
          {selectedRoute.points.slice(0, -1).map(([x, y], i) => {
            const [nx, ny] = selectedRoute.points[i + 1]
            return (
              <circle
                key={`mid-${i}`}
                cx={(x + nx) / 2}
                cy={(y + ny) / 2}
                r={1}
                fill="#fff"
                stroke={ACCENT}
                strokeWidth={0.35}
                strokeDasharray="0.6 0.5"
                style={{ cursor: 'copy' }}
                onPointerDown={(e) => {
                  props.onVertexInsert(i, [(x + nx) / 2, (y + ny) / 2])
                  startVertexDrag(e, i + 1)
                }}
              />
            )
          })}
          {selectedRoute.points.map(([x, y], i) =>
            i === 0 ? (
              // The start is where the actor already is; move the actor (or the earlier route) to change it.
              <rect key="anchor" x={x - 1} y={y - 1} width={2} height={2} fill={ACCENT} pointerEvents="none" />
            ) : (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={1.5}
                fill={ACCENT}
                stroke="#fff"
                strokeWidth={0.4}
                style={{ cursor: 'grab' }}
                onPointerDown={(e) => startVertexDrag(e, i)}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  if (i < selectedRoute.points.length - 1) props.onVertexRemove(i)
                }}
              />
            ),
          )}
        </g>
      )}

      {ordered.map((actor) => {
        const [x, y] = displayPosition(actor, frame, drill.actors)
        const carried = actor.carriedBy !== undefined
        const draggable = step === null && !carried && !busy
        const chosen = selection?.kind === 'actor' && selection.id === actor.id
        return (
          <g
            key={actor.id}
            transform={`translate(${x} ${y})`}
            className={draggable ? 'actor' : 'actor fixed'}
            onPointerDown={(e) => {
              e.stopPropagation()
              if (drawing) {
                props.onDrawPoint(frame[actor.id] ?? [x, y], actor.id) // a click on an actor, e.g. to pass to them
                return
              }
              if (routeTool) {
                props.onRouteStart(actor.id, frame[actor.id] ?? [x, y])
                return
              }
              props.onSelect({ kind: 'actor', id: actor.id })
              if (!draggable) return
              const [px, py] = toFeet(e)
              grab.current = { id: actor.id, dx: x - px, dy: y - py }
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              if (grab.current?.id !== actor.id) return
              const [px, py] = toFeet(e)
              props.onActorDrag(actor.id, [px + grab.current.dx, py + grab.current.dy])
            }}
            onPointerUp={() => {
              if (grab.current?.id !== actor.id) return
              grab.current = null
              props.onActorDragEnd()
            }}
            onPointerCancel={() => {
              grab.current = null
              props.onActorDragEnd()
            }}
          >
            {chosen && (
              <circle r={GRAB_RADIUS - 0.4} fill="none" stroke={ACCENT} strokeWidth={0.5} strokeDasharray="1.2 0.9" />
            )}
            <ActorSymbol actor={actor} />
            {/* An invisible, larger target so small things (a puck) are easy to grab. A
                carried puck sits beside its carrier, so its target must stay small or it
                would cover the carrier and you could not click the player holding it. */}
            <circle r={carried ? 1.4 : GRAB_RADIUS} fill="transparent" />
          </g>
        )
      })}
    </svg>
  )
}
