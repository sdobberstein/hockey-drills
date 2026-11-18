/**
 * Undo/redo as a plain data structure: the past, the present, and the future.
 *
 * This works because a drill is a small JSON value and every edit produces a
 * new one (nothing is mutated), so "undo" is just stepping back to an earlier
 * value. No per-edit inverse operations to write and keep correct.
 *
 * Dragging needs special care. A drag produces a new drill on every pointer
 * move; if each became an undo step you would press undo a hundred times to
 * undo one drag. So a drag is a "gesture": beginGesture remembers the drill
 * from before it, preview updates the present freely, and endGesture records
 * one single undo step from the remembered drill to wherever it ended.
 */

export interface History<T> {
  past: readonly T[]
  present: T
  future: readonly T[]
  /** While a gesture is in progress: the value from before it started. */
  base?: T
}

/** Remember at most this many undo steps, so a long session cannot grow forever. */
export const HISTORY_LIMIT = 100

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] }
}

/** Make an edit: one undo step, and any redo steps are discarded (a new branch). */
export function commit<T>(history: History<T>, next: T): History<T> {
  if (Object.is(next, history.present)) return history
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  }
}

/** Start a gesture (such as a drag). Safe to call twice; the first start wins. */
export function beginGesture<T>(history: History<T>): History<T> {
  return history.base === undefined ? { ...history, base: history.present } : history
}

/** Update the present during a gesture, without making undo steps. */
export function preview<T>(history: History<T>, next: T): History<T> {
  // Remember the "before" value first; doing it after replacing the present
  // would record the new value as the starting point.
  return { ...beginGesture(history), present: next }
}

/** Finish a gesture: one undo step back to where it started, or none if nothing changed. */
export function endGesture<T>(history: History<T>): History<T> {
  const { base, ...rest } = history
  if (base === undefined) return history
  if (Object.is(base, history.present)) return rest
  return { ...rest, past: [...history.past, base].slice(-HISTORY_LIMIT), future: [] }
}

export const canUndo = <T>(history: History<T>) => history.past.length > 0 || history.base !== undefined
export const canRedo = <T>(history: History<T>) => history.future.length > 0

export function undo<T>(history: History<T>): History<T> {
  // Undoing mid-gesture first closes the gesture, so it counts as a step.
  const h = endGesture(history)
  if (h.past.length === 0) return h
  const previous = h.past[h.past.length - 1]
  return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] }
}

export function redo<T>(history: History<T>): History<T> {
  if (history.future.length === 0) return history
  const [next, ...rest] = history.future
  return { past: [...history.past, history.present], present: next, future: rest }
}
