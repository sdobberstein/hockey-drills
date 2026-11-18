import type { Drill } from '../engine/types'

/**
 * Turn the flat list of drill files into what the library page shows.
 *
 * A "progression" is just drills sharing `progression.series`, ordered by
 * `progression.order` (PLAN.md, "Progressions"). There is no index file to
 * build: the app already bundles every drill, so the grouping is computed
 * from the drills themselves and cannot go stale.
 */

export type LibraryEntry =
  | { kind: 'single'; title: string; drill: Drill }
  | { kind: 'series'; title: string; series: string; drills: Drill[] }

export function buildLibrary(drills: readonly Drill[]): LibraryEntry[] {
  const bySeries = new Map<string, Drill[]>()
  const entries: LibraryEntry[] = []

  for (const drill of drills) {
    if (drill.progression) {
      const list = bySeries.get(drill.progression.series) ?? []
      list.push(drill)
      bySeries.set(drill.progression.series, list)
    } else {
      entries.push({ kind: 'single', title: drill.title, drill })
    }
  }

  for (const [series, list] of bySeries) {
    const ordered = sortInSeries(list)
    // A "series" of one is just a drill; do not make it look like a group.
    if (ordered.length === 1) {
      entries.push({ kind: 'single', title: ordered[0].title, drill: ordered[0] })
    } else {
      entries.push({ kind: 'series', title: seriesTitle(series), series, drills: ordered })
    }
  }

  return entries.sort((a, b) => a.title.localeCompare(b.title))
}

/** Where a drill sits in its progression, for previous/next links. */
export interface Neighbours {
  previous?: Drill
  next?: Drill
  /** 1-based position and the number of drills in the series. */
  position: number
  total: number
}

export function neighbours(drills: readonly Drill[], drill: Drill): Neighbours | null {
  if (!drill.progression) return null
  const list = sortInSeries(drills.filter((d) => d.progression?.series === drill.progression!.series))
  if (list.length < 2) return null
  const i = list.findIndex((d) => d.id === drill.id)
  return { previous: list[i - 1], next: list[i + 1], position: i + 1, total: list.length }
}

function sortInSeries(list: readonly Drill[]): Drill[] {
  return [...list].sort(
    (a, b) => a.progression!.order - b.progression!.order || a.title.localeCompare(b.title),
  )
}

/** "cycle-give-and-go" -> "Cycle give and go". */
export function seriesTitle(series: string): string {
  const words = series.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
