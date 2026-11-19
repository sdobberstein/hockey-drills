import { useMemo, useRef, useState } from 'react'
import { initialState } from '../engine/plan'
import type { Heading } from '../engine/timeline'
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

/** A grab of one bounce of the selected banked pass: the pass (its number in the order they happen) and which bounce. */
export interface BounceGrab {
  link: number
  index: number
}

export type StagePhase = 'start' | 'move' | 'end'

/** What a click landed on while a pass tool is chosen. */
export type PassClick = (
  | { kind: 'path'; actor: string; point: Point }
  | { kind: 'actor'; id: string }
  | { kind: 'ice'; point: Point }
) & {
  /** Shift was held: while linking a pass this adds a bounce off the boards instead of landing it. */
  shift?: boolean
}

interface Props {
  drill: Drill
  flow: Flow
  starts: Starts
  /** Passes and shots, in the order they happen; faint for context, and clickable to select. */
  flights: readonly { index: number; style: MoveStyle; path: readonly Point[] }[]
  selection: Selection
  /** Which way each skater is heading, so a carried puck is drawn in front of them. */
  headings?: Readonly<Record<string, Heading>>
  armed: ActorType | null
  /** A run style is chosen: clicking a skater starts a run for them. */
  routeTool: boolean
  drawing: Drawing | null
  onSelect: (selection: Selection) => void
  onPlace: (at: Point) => void
  onActorDrag: (id: string, to: Point) => void
  onActorDragEnd: () => void
  onRunStart: (actor: string) => void
  /** A pass tool is chosen: clicks pick where a pass leaves and lands. */
  passTool: boolean
  /** Where the pass being linked leaves, once that is chosen: drawn with a line to the pointer. */
  passFrom: Point | null
  /** Bounces already added to that pass, in order. */
  passVia: readonly Point[]
  /** Stretches of other skaters' paths where that pass could land, drawn in green to aim at. */
  zones: readonly { actor: string; points: readonly Point[] }[]
  onPassClick: (click: PassClick) => void
  /** Pickups already in the drill, drawn as a ring where the skater takes the puck. */
  pickups: readonly { index: number; point: Point }[]
  /** While the pickup tool is chosen: the loose pucks that can still be picked up. */
  looseSpots: readonly { puck: string; point: Point }[]
  onDrawPoint: (at: Point, onActor?: string) => void
  onFinishDrawing: () => void
  onVertex: (grab: VertexGrab, to: Point, phase: StagePhase) => void
  onVertexRemove: (actor: string, piece: number, index: number) => void
  /** Drag a bounce of the selected banked pass; it snaps to the boards. */
  onBounce: (grab: BounceGrab, to: Point, phase: StagePhase) => void
  onBounceRemove: (grab: BounceGrab) => void
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
  const { drill, flow, starts, flights, selection, armed, routeTool, drawing, passTool, passFrom, zones, headings } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const grab = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const vertex = useRef<VertexGrab | null>(null)
  const bounce = useRef<BounceGrab | null>(null)
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
  const busy = drawingNow || armed !== null || routeTool || passTool

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
        else if (passTool) props.onPassClick({ kind: 'ice', point: toFeet(e), shift: e.shiftKey })
        else if (armed) props.onPlace(toFeet(e))
        else props.onSelect(null)
      }}
      onPointerMove={(e) => {
        if (bounce.current) props.onBounce(bounce.current, toFeet(e), 'move')
        else if (vertex.current) props.onVertex(vertex.current, toFeet(e), 'move')
        else if (drawingNow || passFrom) setCursor(toFeet(e))
      }}
      onPointerUp={(e) => {
        if (bounce.current) {
          props.onBounce(bounce.current, toFeet(e), 'end')
          bounce.current = null
          return
        }
        if (!vertex.current) return
        props.onVertex(vertex.current, toFeet(e), 'end')
        vertex.current = null
      }}
      onDoubleClick={(e) => {
        if (drawingNow) {
          props.onFinishDrawing()
          return
        }
        // A bounce handle captures the pointer so a drag can leave the dot, which sends the
        // double-click here instead of to the dot. So find the bounce under it by position.
        if (selection?.kind !== 'pass') return
        const at = toFeet(e)
        const via = flow.events[selection.link]?.target.via ?? []
        const hit = via.findIndex(([x, y]) => Math.hypot(x - at[0], y - at[1]) <= GRAB_RADIUS)
        if (hit >= 0) props.onBounceRemove({ link: selection.link, index: hit })
      }}
    >
      <Rink />

      {/* Passes and shots, faint, so the paths can be read against them. */}
      {flights.map((f) => {
        const chosen = selection?.kind === 'pass' && selection.link === f.index
        return (
          <g key={`f${f.index}`}>
            {chosen && (
              <polyline points={pointsAttr(f.path)} fill="none" stroke={ACCENT} strokeOpacity={0.3} strokeWidth={3} strokeLinejoin="round" pointerEvents="none" />
            )}
            <MoveLine style={f.style} path={f.path} opacity={chosen ? 1 : 0.35} />
            <polyline
              points={pointsAttr(f.path)}
              fill="none"
              stroke="transparent"
              strokeWidth={3}
              pointerEvents={busy ? 'none' : 'stroke'}
              style={{ cursor: 'pointer' }}
              onPointerDown={(e) => {
                e.stopPropagation()
                props.onSelect({ kind: 'pass', link: f.index })
              }}
            />
          </g>
        )
      })}

      {/* Loose pucks waiting to be picked up, marked so there is something to click. */}
      {props.looseSpots.map((s) => (
        <g key={`l-${s.puck}-${s.point[0]}-${s.point[1]}`} pointerEvents="none" fill="none" stroke="#b3541e" strokeWidth={0.5}>
          <circle cx={s.point[0]} cy={s.point[1]} r={3} strokeDasharray="1.2 0.9" />
          <circle cx={s.point[0]} cy={s.point[1]} r={0.9} fill="#b3541e" stroke="#fff" strokeWidth={0.3} />
        </g>
      ))}

      {/* Where the pass being linked could land: a soft wide band to aim at, with a clear line down the middle. */}
      {zones.map((z, i) => (
        <g key={`z${i}`} pointerEvents="none" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <polyline className="landing-zone" points={pointsAttr(z.points)} stroke="#2e9e4f" strokeOpacity={0.22} strokeWidth={9} />
          <polyline points={pointsAttr(z.points)} stroke="#2e9e4f" strokeOpacity={0.9} strokeWidth={1.1} />
        </g>
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
                  if (passTool) props.onPassClick({ kind: 'path', actor, point: toFeet(e), shift: e.shiftKey })
                  else props.onSelect({ kind: 'piece', actor, piece: seg.index })
                }}
              />
            </g>
          ) : null,
        ),
      )}

      {/* The pass being linked: where it leaves, and a dashed line to the pointer. */}
      {passFrom && (
        <g pointerEvents="none" fill="none" stroke="#b3541e" strokeWidth={0.5} strokeLinecap="round">
          <polyline points={pointsAttr([passFrom, ...props.passVia, ...(cursor ? [cursor] : [])])} strokeDasharray="1.2 0.9" strokeLinejoin="round" />
          {props.passVia.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={1} fill="#fff" stroke="#b3541e" strokeWidth={0.5} />
          ))}
          <circle cx={passFrom[0]} cy={passFrom[1]} r={1.3} fill="#b3541e" stroke="#fff" strokeWidth={0.4} />
        </g>
      )}

      {/* Where each skater takes a loose puck: a ring on their path, clickable to select it. */}
      {props.pickups.map((u) => {
        const chosen = selection?.kind === 'pickup' && selection.index === u.index
        return (
          <g key={`u${u.index}`}>
            <circle cx={u.point[0]} cy={u.point[1]} r={2} fill="#fff" fillOpacity={0.6} stroke={chosen ? ACCENT : '#b3541e'} strokeWidth={chosen ? 0.7 : 0.5} />
            <circle cx={u.point[0]} cy={u.point[1]} r={0.7} fill={chosen ? ACCENT : '#b3541e'} pointerEvents="none" />
            <circle
              cx={u.point[0]}
              cy={u.point[1]}
              r={3}
              fill="transparent"
              pointerEvents={busy ? 'none' : 'all'}
              style={{ cursor: 'pointer' }}
              onPointerDown={(e) => {
                e.stopPropagation()
                props.onSelect({ kind: 'pickup', index: u.index })
              }}
            />
          </g>
        )
      })}

      {/* Handles on the bounces of the selected banked pass: drag along the wall, double-click to remove. */}
      {selection?.kind === 'pass' &&
        (flow.events[selection.link]?.target.via ?? []).map(([x, y], i) => (
          <circle
            key={`b${selection.link}-${i}`}
            cx={x}
            cy={y}
            r={1.5}
            fill={ACCENT}
            stroke="#fff"
            strokeWidth={0.4}
            style={{ cursor: 'grab' }}
            onPointerDown={(e) => {
              e.stopPropagation()
              svgRef.current!.setPointerCapture(e.pointerId)
              bounce.current = { link: selection.link, index: i }
              props.onBounce(bounce.current, toFeet(e), 'start')
            }}
          />
        ))}

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
        const [x, y] = displayPosition(actor, frame, drill.actors, headings)
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
              if (passTool) {
                // A puck someone is carrying is drawn just in front of them, so a click on it means
                // them: it is the natural thing to click when you want to pass it.
                props.onPassClick({ kind: 'actor', id: actor.carriedBy ?? actor.id })
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
