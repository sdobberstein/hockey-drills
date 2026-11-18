import type { Drill } from '../engine/types'
import { copyForEditing } from '../editor/ops'
import { listDrafts, saveDraft } from '../editor/drafts'
import { libraryDrills } from '../library/drills'
import { encode } from '../share/codec'
import { drillHash, editHash, sharedHash } from './route'

/** An absolute URL for a hash, so it works pasted anywhere. */
function absolute(hash: string): string {
  return `${window.location.origin}${window.location.pathname}${hash}`
}

export const libraryLink = (id: string) => absolute(drillHash(id))
export const selfContainedLink = async (drill: Drill) => absolute(sharedHash(await encode(drill)))

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

/**
 * Save a drill as <id>.json: the same file you would commit to drills/ to add
 * it to the library. This is how a drill made or received outside the repo
 * becomes part of it.
 */
export function downloadDrill(drill: Drill): void {
  const blob = new Blob([JSON.stringify(drill, null, 2) + '\n'], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${drill.id}.json`
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Make a draft from a drill that is not already one (a shared link, an opened
 * file) and open it in the editor. The id is kept unless it is taken, in which case
 * the copy gets a new one, so nothing already in the library or your drafts is
 * overwritten. Returns false if the draft could not be saved (browser storage
 * unavailable), in which case nothing is opened.
 */
export function startEditing(drill: Drill): boolean {
  const taken = new Set([...libraryDrills.map((d) => d.id), ...listDrafts().map((d) => d.id)])
  const copy = copyForEditing(drill, taken)
  if (!saveDraft(copy)) return false
  window.location.hash = editHash(copy.id)
  return true
}
