import { useMemo, useRef } from 'react'
import type { Drill } from '../engine/types'
import { buildTimelineModel, type PuckSpan, type TimelinePiece } from './view'

interface Props {
  drill: Drill
  /** The current moment, drawn as a playhead. Omit for a static view. */
  time?: number
  /** If given, clicking or dragging on the timeline moves to that moment. */
  onSeek?: (t: number) => void
}

/** Each row is this tall (px). The links drawn between rows rely on it being fixed. */
const ROW = 26

/**
 * Who does what, when. One row for each skater and one for the puck, laid out
 * on a shared clock, so a skater standing still shows as an amber block and a
 * pass shows as a line from the passer to the receiver.
 *
 * It is read-only: it draws what the drill already does. Its job is to make
 * stops visible at a glance, which the ice alone does not.
 */
export function Timeline({ drill, time, onSeek }: Props) {
  const model = useMemo(() => buildTimelineModel(drill), [drill])
  const overlay = useRef<HTMLDivElement>(null)
  if (!model || model.duration <= 0) return null

  const D = model.duration
  const pct = (t: number) => `${(t / D) * 100}%`
  const x = (t: number) => (t / D) * 100
  const rowOf = new Map<string, number>()
  model.rows.forEach((r, i) => rowOf.set(r.actor, i))
  const height = (model.rows.length + model.pucks.length) * ROW

  const seekTo = (e: React.PointerEvent) => {
    if (!onSeek || !overlay.current) return
    const rect = overlay.current.getBoundingClientRect()
    onSeek(Math.min(Math.max(((e.clientX - rect.left) / rect.width) * D, 0), D))
  }

  const tickEvery = D <= 6 ? 0.5 : 1
  const ticks = Array.from({ length: Math.floor(D / tickEvery) + 1 }, (_, i) => i * tickEvery)

  return (
    <section className="timeline" aria-label="Timeline">
      <div
        className={onSeek ? 'tl-grid seekable' : 'tl-grid'}
        onPointerDown={(e) => {
          if (!onSeek) return
          e.currentTarget.setPointerCapture(e.pointerId)
          seekTo(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) seekTo(e)
        }}
      >
        <div className="tl-corner" />
        <div className="tl-axis">
          {ticks.map((t) => (
            <span key={t} className="tl-tick" style={{ left: pct(t) }}>
              {Number.isInteger(t) ? `${t}s` : ''}
            </span>
          ))}
          {model.steps.map((s, i) => (
            <span key={i} className="tl-step" style={{ left: pct(s.start) }} title={s.name ?? `Step ${i + 1}`}>
              {s.name ?? i + 1}
            </span>
          ))}
        </div>

        {model.rows.map((row) => (
          <Row key={row.actor} label={row.label}>
            {row.pieces.map((p, i) => (
              <Piece key={i} piece={p} total={D} />
            ))}
          </Row>
        ))}
        {model.pucks.map((puck) => (
          <Row key={puck.actor} label={puck.label} puck>
            {puck.spans.map((s, i) => (
              <Span key={i} span={s} total={D} />
            ))}
          </Row>
        ))}

        {/* Lines over the rows: step starts, passes, and the playhead. */}
        <div className="tl-overlay" ref={overlay} style={{ height }}>
          <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height={height} aria-hidden="true">
            {model.steps.map((s, i) => (
              <line key={i} x1={x(s.start)} x2={x(s.start)} y1={0} y2={height} className="tl-stepline" />
            ))}
            {model.links.map((link, i) => {
              const from = rowOf.get(link.from.actor)
              const to = link.to.actor === null ? undefined : rowOf.get(link.to.actor)
              if (from === undefined || to === undefined) return null
              return (
                <g key={i}>
                  <line x1={x(link.from.t)} y1={(from + 0.5) * ROW} x2={x(link.to.t)} y2={(to + 0.5) * ROW} className="tl-link" />
                  <circle cx={x(link.to.t)} cy={(to + 0.5) * ROW} r={0.6} className="tl-landing" />
                </g>
              )
            })}
            {time !== undefined && <line x1={x(time)} x2={x(time)} y1={0} y2={height} className="tl-playhead" />}
          </svg>
        </div>
      </div>
      <p className="hint">
        Amber blocks are stops: someone standing still before they start again, or while a pass arrives. Blue-grey blocks are a late start.
      </p>
    </section>
  )
}

function Row({ label, puck, children }: { label: string; puck?: boolean; children: React.ReactNode }) {
  return (
    <>
      <div className={puck ? 'tl-label puck' : 'tl-label'}>{label}</div>
      <div className="tl-track">{children}</div>
    </>
  )
}

function Piece({ piece, total }: { piece: TimelinePiece; total: number }) {
  const length = piece.t1 - piece.t0
  const wide = length / total
  const title =
    piece.kind === 'run'
      ? `${piece.style}: ${length.toFixed(2)} s`
      : `${piece.role === 'stop' ? 'stands still' : piece.role === 'delay' ? 'has not started' : 'finished'}: ${length.toFixed(2)} s`
  const cls = piece.kind === 'run' ? `tl-piece tl-run tl-${piece.style}` : `tl-piece tl-wait tl-${piece.role}`
  return (
    <div className={cls} style={{ left: `${(piece.t0 / total) * 100}%`, width: `${wide * 100}%` }} title={title}>
      {wide > 0.11 ? (piece.kind === 'run' ? piece.style : `${length.toFixed(1)} s`) : ''}
    </div>
  )
}

function Span({ span, total }: { span: PuckSpan; total: number }) {
  const length = span.t1 - span.t0
  const wide = length / total
  const cls = span.flight ? 'tl-piece tl-flight' : span.carrier ? 'tl-piece tl-carried' : 'tl-piece tl-loose'
  const text = span.flight ?? span.carrier ?? ''
  return (
    <div
      className={cls}
      style={{ left: `${(span.t0 / total) * 100}%`, width: `${wide * 100}%` }}
      title={span.flight ? `${span.flight}: ${length.toFixed(2)} s in the air` : span.carrier ? `${span.carrier} has the puck` : 'loose'}
    >
      {wide > 0.07 ? text : ''}
    </div>
  )
}
