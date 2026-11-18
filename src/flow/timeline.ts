import { distance, pointAlong } from '../engine/geometry'
import { DEFAULT_SPEEDS } from '../engine/plan'
import type { Point } from '../engine/types'
import { denseOf } from './geometry'
import type { Marker, Piece } from './types'

/** Times closer than this (seconds) are the same instant. */
export const TIME_EPS = 1e-6

/** One piece placed on its actor's own clock. */
export interface Segment {
  piece: Piece
  index: number
  t0: number
  t1: number
  /** Feet per second for a run; 0 for a wait. */
  speed: number
  /** The polyline a run follows (curve included); a single point for a wait. */
  geometry: Point[]
  /** Arc length of a run in feet; 0 for a wait. */
  length: number
  /** Where the actor is when this piece starts. */
  from: Point
  /** Where the actor is when this piece ends. */
  to: Point
}

/**
 * Lay an actor's pieces end to end from t = 0. A run lasts length / speed, with
 * the length of the curve when it is smooth, exactly as the engine times it.
 */
export function segmentsFor(pieces: readonly Piece[], start: Point): Segment[] {
  const segments: Segment[] = []
  let clock = 0
  let here: Point = start
  pieces.forEach((piece, index) => {
    if (piece.kind === 'wait') {
      segments.push({ piece, index, t0: clock, t1: clock + piece.seconds, speed: 0, geometry: [here], length: 0, from: here, to: here })
      clock += piece.seconds
      return
    }
    const geometry = denseOf(piece.points, piece.smooth)
    let length = 0
    for (let i = 1; i < geometry.length; i++) length += distance(geometry[i - 1], geometry[i])
    const speed = piece.speed ?? DEFAULT_SPEEDS[piece.style]
    const to = geometry[geometry.length - 1]
    segments.push({ piece, index, t0: clock, t1: clock + length / speed, speed, geometry, length, from: geometry[0], to })
    clock += length / speed
    here = to
  })
  return segments
}

export const endTime = (segments: readonly Segment[]): number => (segments.length === 0 ? 0 : segments[segments.length - 1].t1)

/** The time a marker is reached. Clamped to its piece. */
export function markerTime(segments: readonly Segment[], marker: Marker): number {
  const s = segments[marker.piece]
  if (!s) return endTime(segments)
  const into = s.piece.kind === 'wait' ? Math.min(Math.max(marker.at, 0), s.piece.seconds) : Math.min(Math.max(marker.at, 0), s.length) / s.speed
  return s.t0 + into
}

/** Where a marker is. */
export function markerPoint(segments: readonly Segment[], marker: Marker, start: Point): Point {
  const s = segments[marker.piece]
  if (!s) return segments.length === 0 ? start : segments[segments.length - 1].to
  return s.piece.kind === 'wait' ? s.from : pointAlong(s.geometry, marker.at)
}

/**
 * The marker for a moment on an actor's timeline. At an instant shared by two
 * pieces it picks the later one (at = 0), which is the same moment and place.
 * After the last piece it points at the end of the last piece.
 */
export function markerAtTime(segments: readonly Segment[], actor: string, t: number): Marker | null {
  if (segments.length === 0) return null
  for (const s of segments) {
    if (t < s.t1 - TIME_EPS) {
      const into = Math.max(t - s.t0, 0)
      return { actor, piece: s.index, at: s.piece.kind === 'wait' ? into : into * s.speed }
    }
  }
  const last = segments[segments.length - 1]
  return { actor, piece: last.index, at: last.piece.kind === 'wait' ? last.piece.seconds : last.length }
}

/** Where an actor is at a moment: the piece they are in, or standing at the end. */
export function positionAtTime(segments: readonly Segment[], start: Point, t: number): Point {
  if (segments.length === 0) return start
  for (const s of segments) {
    if (t < s.t1 - TIME_EPS) return s.piece.kind === 'wait' ? s.from : pointAlong(s.geometry, Math.max(t - s.t0, 0) * s.speed)
  }
  return segments[segments.length - 1].to
}
