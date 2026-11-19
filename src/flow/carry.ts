import type { Point } from '../engine/types'
import { cutPolyline } from './geometry'

/** A stretch of a skater's run with, or without, the puck. */
export interface CarryStretch {
  points: Point[]
  carrying: boolean
}

/**
 * Split a run into the stretches where the skater has the puck and where they do not, for drawing
 * forward skating "with puck" only where it is true. `holds` are the times the skater holds a puck;
 * the run is `geometry`, starting at `t0` and skated at `speed`, so a moment in time is a distance
 * along it. A run with the puck all the way (or none of the way) comes back as one stretch.
 */
export function carryStretches(
  geometry: readonly Point[],
  run: { t0: number; t1: number; speed: number; length: number },
  holds: readonly { t0: number; t1: number }[],
): CarryStretch[] {
  // The distances along the run where the skater picks the puck up or lets go.
  const cuts = new Set<number>()
  for (const h of holds) {
    for (const t of [h.t0, h.t1]) {
      if (t > run.t0 + 1e-6 && t < run.t1 - 1e-6) cuts.add((t - run.t0) * run.speed)
    }
  }
  const edges = [0, ...[...cuts].sort((a, b) => a - b), run.length]
  const mid = (a: number, b: number) => run.t0 + ((a + b) / 2) / run.speed
  const out: CarryStretch[] = []
  for (let i = 0; i + 1 < edges.length; i++) {
    const [from, to] = [edges[i], edges[i + 1]]
    if (to - from < 1e-6) continue
    const carrying = holds.some((h) => h.t0 <= mid(from, to) && mid(from, to) < h.t1)
    const points = cutPolyline(geometry, from, to)
    const last = out[out.length - 1]
    // Neighbours in the same state are one stretch (a hold that starts and ends inside another).
    if (last && last.carrying === carrying) last.points = [...last.points, ...points.slice(1)]
    else out.push({ points, carrying })
  }
  return out.length > 0 ? out : [{ points: [...geometry], carrying: false }]
}
