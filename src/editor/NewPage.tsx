import { useEffect, useRef } from 'react'
import { editHash } from '../app/route'
import { libraryDrills } from '../library/drills'
import { listDrafts, saveDraft } from './drafts'
import { blankDrill, uniqueDrillId } from './ops'

/**
 * Make a blank drill and go straight to editing it.
 *
 * The draft is saved first and the route is replaced (not pushed), so a
 * refresh reopens the same drill instead of making a second one, and the back
 * button does not return to this empty page.
 */
export function NewPage() {
  const started = useRef(false)

  useEffect(() => {
    // React runs effects twice in development; without this we would make two drills.
    if (started.current) return
    started.current = true
    const taken = new Set([...libraryDrills.map((d) => d.id), ...listDrafts().map((d) => d.id)])
    const id = uniqueDrillId('new drill', taken)
    saveDraft(blankDrill(id))
    window.location.replace(editHash(id))
  }, [])

  return <p>Starting a new drill…</p>
}
