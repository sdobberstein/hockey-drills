import { useMemo, useState } from 'react'
import { deleteDraft, listDrafts } from '../editor/drafts'
import { libraryDrills } from '../library/drills'
import { buildLibrary } from '../library/library'
import { drillHash, editHash, newHash } from './route'
import { OpenDrill } from './OpenDrill'

/** The list of drills, with progressions grouped in order. */
export function LibraryPage() {
  const entries = useMemo(() => buildLibrary(libraryDrills), [])
  // Drafts live in the browser, so read them when the page opens and again after a delete.
  const [drafts, setDrafts] = useState(() => listDrafts())

  return (
    <>
      <p>
        <a className="button" href={newHash()}>
          New drill
        </a>
      </p>
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

      {drafts.length > 0 && (
        <section className="drafts">
          <h2>Your drafts</h2>
          <p className="hint">Saved in this browser only. Download a draft's JSON and add it to drills/ to put it in the library.</p>
          <ul>
            {drafts.map((d) => (
              <li key={d.id}>
                <a href={editHash(d.id)}>{d.title}</a>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete the draft “${d.title}”?`)) {
                      deleteDraft(d.id)
                      setDrafts(listDrafts())
                    }
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <OpenDrill />
    </>
  )
}
