import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { Drill } from '../engine/types'
import { saveDraft } from './drafts'
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  endGesture,
  preview,
  redo,
  undo,
  type History,
} from './history'

type Action =
  | { type: 'commit'; drill: Drill }
  | { type: 'preview'; drill: Drill }
  | { type: 'end' }
  | { type: 'undo' }
  | { type: 'redo' }

function reducer(history: History<Drill>, action: Action): History<Drill> {
  switch (action.type) {
    case 'commit':
      return commit(history, action.drill)
    case 'preview':
      return preview(history, action.drill)
    case 'end':
      return endGesture(history)
    case 'undo':
      return undo(history)
    case 'redo':
      return redo(history)
  }
}

export type SaveStatus = 'untouched' | 'saved' | 'failed'

/**
 * The editor's state: the drill being edited, with undo/redo, and autosave of
 * a draft to the browser.
 *
 * Autosave waits until the first real change, so merely opening a library
 * drill does not leave a draft behind. It is debounced so a drag does not
 * write storage on every pointer move, and flushed when you leave so the
 * debounce never costs you work.
 */
export function useEditor(initial: Drill) {
  const [history, dispatch] = useReducer(reducer, initial, createHistory)
  const [status, setStatus] = useState<SaveStatus>('untouched')

  const drill = history.present
  // Has anything ever changed? Computed from the history itself. After undoing
  // everything the future is non-empty, so this stays true and the reverted
  // drill overwrites any stale draft.
  const touched = drill !== initial || history.past.length > 0 || history.future.length > 0

  useEffect(() => {
    if (!touched) return
    const timer = setTimeout(() => setStatus(saveDraft(drill) ? 'saved' : 'failed'), 400)
    return () => clearTimeout(timer)
  }, [drill, touched])

  // The debounce above would lose a change made just before you leave. So also
  // save immediately when the page is hidden or closed, and when the editor is
  // left for another route. The ref gives those handlers the latest values
  // without re-registering them on every edit.
  const latest = useRef({ drill, touched })
  useEffect(() => {
    latest.current = { drill, touched }
  })
  useEffect(() => {
    const flush = () => {
      if (latest.current.touched) saveDraft(latest.current.drill)
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])

  return {
    drill,
    status,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    /** One undo step. */
    edit: useCallback((next: Drill) => dispatch({ type: 'commit', drill: next }), []),
    /** Update during a drag, with no undo steps until endGesture. */
    preview: useCallback((next: Drill) => dispatch({ type: 'preview', drill: next }), []),
    endGesture: useCallback(() => dispatch({ type: 'end' }), []),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
  }
}
