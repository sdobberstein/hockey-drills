import type { Drill } from '../engine/types'
import { encode } from '../share/codec'
import { drillHash, sharedHash } from './route'

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
