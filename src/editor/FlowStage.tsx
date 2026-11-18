import { useMemo, useRef, useState } from 'react'
import { initialState } from '../engine/plan'
import type { ActorType, Drill, MoveStyle, Point } from '../engine/types'
import type { Starts } from '../flow/edit'
import { segmentsFor, type Segment } from '../flow/timeline'
import type { Flow } from '../flow/types'
import { ActorSymbol } from '../render/ActorSymbol'
import { displayPosition } from '../render/layout'
import { MoveLine } from '../render/MoveLine'
import { Rink } from '../render/Rink'
import { viewAspect, viewBoxFor } from '../render/rinkGeometry'
import type { Drawing, Selection } from './selection'

/** A grab of one point of a run: which one, and whether it is a new point being inserted as it is dragged. */
export interface VertexGrab {
  actor: string
  piece: number
  index: number
  /** Set when the grab started on a "+" ring: the point is added after this one, then dragged. */
  insertAfter?: number
  insertAt?: Point
}

export type StagePhase = 'start' | 'move' | 'end'

interface Props {
  drill: Drill
  flow: Flow
  starts: Starts
  /** Passes and shots, drawn faint for context. */
  flights: readonly { style: MoveStyle; path: readonly Point[] }[]
  selection: Selection
  armed: ActorType | null
  /** A run style is chosen: clicking a skater starts a run for them. */
  routeTool: boolean
  drawing: Drawing | null
  onSelect: (selection: Selection) => void
  onPlace: (at: Point) => void
  onActorDrag: (id: string, to: Point) => void
  onActorDragEnd: () => void
  onRunStart: (actor: string) => void
  onDrawPoint: (at: Point, onActor?: string) => void
  onFinishDrawing: () => void
  onVertex: (grab: VertexGrab, to: Point, phase: StagePhase) => void
  onVertexRemove: (actor: string, piece: number, index: number) => void
}

const GRAB_RADIUS = 4
const ACCENT = 'var(--accent)'
const pointsAttr = (pts: readonly Point[]) => pts.map(([x, y]) => `${x},${y}`).join(' ')

/**
 * The ice in the flow view. Each skater's whole path is drawn, as one run after
 * another; clicking a run selects it (and so selects it on the timeline too),
 * and a selected run shows handles to reshape it. With a style chosen, click a
 * skater and then click out a new run, which is added to the end of their path.
 *
 * It is the flow view's counterpart of EditStage, and deliberately separate:
 * there are no steps here to be "in", only paths.
 */
export function FlowStage(props: Props) {
  const { drill, flow, starts, flights, selection, armed, routeTool, drawing } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const grab = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const vertex = useRef<VertexGrab | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)

  const toFeet = (e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current!
    const point = svg.createSVGPoint()
    point.x = e.clientX
    point.y = e.clientY
    const p = point.matrixTransform(svg.getScreenCTM()!.inverse())
    return [p.x, p.y]
  }

  // Every skater's path laid out in time, so each run has its curve and its raw points.
  const segments = useMemo(() => {
    const out = new Map<string, Segment[]>()
    for (const [actor, pieces] of Object.entries(flow.paths)) out.set(actor, segmentsFor(pieces, starts[actor]))
    return out
  }, [flow, starts])
  const frame = useMemo(() => Object.fromEntries(initialState(drill).positions), [drill])

  const selectedSeg = selection?.kind === 'piece' ? segments.get(selection.actor)?.[selection.piece] : undefined
  const selectedRun = selectedSeg?.piece.kind === 'run' ? selectedSeg.piece : undefined

  const ordered = [...drill.actors].sort((a, b) => Number(a.type === 'puck') - Number(b.type === 'puck'))
  const aspect = viewAspect(drill.rink)
  const drawingNow = drawing !== null
  const busy = drawingNow || armed !== null || routeTool

  const startVertex = (e: React.PointerEvent, g: VertexGrab) => {
    e.stopPropagation()
    svgRef.current!.setPointerCapture(e.pointerId)
    vertex.current = g
    props.onVertex(g, toFeet(e), 'start')
  }

  return (
    <svg
      ref={svgRef}
      viewBox={viewBoxFor(drill.rink)}
      role="application"
      aria-label={`Editing the paths of ${drill.title}`}
      className={armed || drawingNow ? 'stage armed' : 'stage'}
      style={{ aspectRatio: aspect, width: `min(100%, calc(70vh * ${aspect}))` }}
      onPointerDown={(e) => {
        if (drawingNow) props.onDrawPoint(toFeet(e))
        else if (armed) props.onPlace(toFeet(e))
        else props.onSelect(null)
      }}
      onPointerMove={(e) => {
        if (vertex.current) props.onVertex(vertex.current, toFeet(e), 'move')
        else if (drawingNow) setCursor(toFeet(e))
      }}
      onPointerUp={(e) => {
        if (!vertex.current) return
        props.onVertex(vertex.current, toFeet(e), 'end')
        vertex.current = null
      }}
      onDoubleClick={() => {
        if (drawingNow) props.onFinishDrawing()
      }}
    >
      <Rink />

      {/* Passes and shots, faint, so the paths can be read against them. */}
      {flights.map((f, i) => (
        <MoveLine key={`f${i}`} style={f.style} path={f.path} opacity={0.3} />
      ))}

      {/* Each skater's runs. */}
      {[...segments].flatMap(([actor, list]) =>
        list.map((seg) =>
          seg.piece.kind === 'run' ? (
            <g key={`${actor}-${seg.index}`}>
              <MoveLine style={seg.piece.style} path={seg.geometry} opacity={0.9} />
              <polyline
                points={pointsAttr(seg.geometry)}
                fill="none"
                stroke="transparent"
                strokeWidth={3.5}
                strokeLinejoin="round"
                pointerEvents={drawingNow ? 'none' : 'stroke'}
                style={{ cursor: 'pointer' }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  props.onSelect({ kind: 'piece', actor, piece: seg.index })
                }}
              />
            </g>
          ) : null,
        ),
      )}

      {/* A halo under the selected run. */}
      {selectedSeg && selectedRun && (
        <polyline
          points={pointsAttr(selectedSeg.geometry)}
          fill="none"
          stroke={ACCENT}
          strokeOpacity={0.25}
          strokeWidth={3}
          strokeLinejoin="round"
          pointerEvents="none"
        />
      )}

      {/* The run being drawn, with a dashed line to the pointer. */}
      {drawing && (
        <g pointerEvents="none" fill="none" stroke={ACCENT} strokeWidth={0.5} strokeLinecap="round">
          <polyline points={pointsAttr(drawing.points)} />
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

      {/* Handles for the selected run: drag a dot to reshape, drag a ring to add a point, double-click a dot to remove it. */}
      {selection?.kind === 'piece' && selectedRun && (
        <g>
          {selectedRun.points.slice(0, -1).map(([x, y], i) => {
            const [nx, ny] = selectedRun.points[i + 1]
            const at: Point = [(x + nx) / 2, (y + ny) / 2]
            return (
              <circle
                key={`mid-${i}`}
                cx={at[0]}
                cy={at[1]}
                r={1}
                fill="#fff"
                stroke={ACCENT}
                strokeWidth={0.35}
                strokeDasharray="0.6 0.5"
                style={{ cursor: 'copy' }}
                onPointerDown={(e) =>
                  startVertex(e, { actor: selection.actor, piece: selection.piece, index: i + 1, insertAfter: i, insertAt: at })
                }
              />
            )
          })}
          {selectedRun.points.map(([x, y], i) =>
            i === 0 ? (
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
                onPointerDown={(e) => startVertex(e, { actor: selection.actor, piece: selection.piece, index: i })}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  if (i < selectedRun.points.length - 1) props.onVertexRemove(selection.actor, selection.piece, i)
                }}
              />
            ),
          )}
        </g>
      )}

      {ordered.map((actor) => {
        const [x, y] = displayPosition(actor, frame, drill.actors)
        const carried = actor.carriedBy !== undefined
        const draggable = !carried && !busy
        const chosen = selection?.kind === 'actor' && selection.id === actor.id
        return (
          <g
            key={actor.id}
            transform={`translate(${x} ${y})`}
            className={draggable ? 'actor' : 'actor fixed'}
            onPointerDown={(e) => {
              e.stopPropagation()
              if (drawingNow) {
                props.onDrawPoint(frame[actor.id] ?? [x, y], actor.id)
                return
              }
              if (routeTool) {
                props.onRunStart(actor.id)
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
            {chosen && <circle r={GRAB_RADIUS - 0.4} fill="none" stroke={ACCENT} strokeWidth={0.5} strokeDasharray="1.2 0.9" />}
            <ActorSymbol actor={actor} />
            <circle r={carried ? 1.4 : GRAB_RADIUS} fill="transparent" />
          </g>
        )
      })}
    </svg>
  )
}
