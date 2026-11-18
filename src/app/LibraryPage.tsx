import { useMemo } from 'react'
import { libraryDrills } from '../library/drills'
import { buildLibrary } from '../library/library'
import { drillHash } from './route'
import { OpenDrill } from './OpenDrill'

/** The list of drills, with progressions grouped in order. */
export function LibraryPage() {
  const entries = useMemo(() => buildLibrary(libraryDrills), [])

  return (
    <>
      <ul className="library">
        {entries.map((entry) =>
          entry.kind === 'single' ? (
            <li key={entry.drill.id} className="card">
              <a href={drillHash(entry.drill.id)}>{entry.title}</a>
              {entry.drill.description && <p>{entry.drill.description}</p>}
            </li>
          ) : (
            <li key={entry.series} className="card">
              <strong>{entry.title}</strong>
              <span className="count"> · {entry.drills.length} drills</span>
              <ol>
                {entry.drills.map((d) => (
                  <li key={d.id}>
                    <a href={drillHash(d.id)}>{d.title}</a>
                  </li>
                ))}
              </ol>
            </li>
          ),
        )}
      </ul>
      {entries.length === 0 && <p>No drills found in drills/.</p>}
      <OpenDrill />
    </>
  )
}
