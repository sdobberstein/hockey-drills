import type { Drill } from '../engine/types'

/**
 * Drafts: work in progress, kept in the browser's localStorage.
 *
 * A draft is not a drill in the library. The library is files in the repo, and
 * the way a draft joins it is to download its JSON and commit it (PLAN.md,
 * "Architecture"). Drafts exist so that closing the tab does not lose work.
 *
 * localStorage can throw or be unavailable (private windows, blocked site
 * data, full disk), and the app must still work without it, so every call
 * here is guarded and failures are treated as "no drafts".
 */

const PREFIX = 'hockey-drills:draft:'

/** The part of localStorage we use, so tests can supply a fake. */
export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  readonly length: number
  key(index: number): string | null
}

function defaultStorage(): DraftStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * A draft may be mid-edit and so not a valid drill (no steps yet, say), so we
 * only check it is shaped enough for the editor to open without crashing.
 */
function looksLikeDrill(value: unknown): value is Drill {
  if (typeof value !== 'object' || value === null) return false
  const d = value as Record<string, unknown>
  return typeof d.id === 'string' && typeof d.title === 'string' && Array.isArray(d.actors) && Array.isArray(d.steps)
}

export function loadDraft(id: string, storage: DraftStorage | null = defaultStorage()): Drill | null {
  try {
    const text = storage?.getItem(PREFIX + id)
    if (!text) return null
    const value: unknown = JSON.parse(text)
    return looksLikeDrill(value) && value.id === id ? value : null
  } catch {
    return null
  }
}

/** Returns false if it could not be saved (so the UI can say so). */
export function saveDraft(drill: Drill, storage: DraftStorage | null = defaultStorage()): boolean {
  try {
    if (!storage) return false
    storage.setItem(PREFIX + drill.id, JSON.stringify(drill))
    return true
  } catch {
    return false
  }
}

export function deleteDraft(id: string, storage: DraftStorage | null = defaultStorage()): void {
  try {
    storage?.removeItem(PREFIX + id)
  } catch {
    // Nothing to do: if it cannot be removed it could not be read either.
  }
}

/** Every draft, sorted by title (we do not track when each was last edited). */
export function listDrafts(storage: DraftStorage | null = defaultStorage()): Drill[] {
  const drafts: Drill[] = []
  try {
    if (!storage) return []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(PREFIX)) {
        const draft = loadDraft(key.slice(PREFIX.length), storage)
        if (draft) drafts.push(draft)
      }
    }
  } catch {
    return []
  }
  return drafts.sort((a, b) => a.title.localeCompare(b.title))
}
