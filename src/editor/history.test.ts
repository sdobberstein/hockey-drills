import { describe, expect, it } from 'vitest'
import {
  beginGesture,
  canRedo,
  canUndo,
  commit,
  createHistory,
  endGesture,
  HISTORY_LIMIT,
  preview,
  redo,
  undo,
} from './history'

describe('history', () => {
  it('undoes and redoes edits', () => {
    let h = createHistory('a')
    h = commit(h, 'b')
    h = commit(h, 'c')
    h = undo(h)
    expect(h.present).toBe('b')
    h = undo(h)
    expect(h.present).toBe('a')
    h = redo(h)
    expect(h.present).toBe('b')
  })

  it('reports whether undo and redo are possible', () => {
    let h = createHistory('a')
    expect([canUndo(h), canRedo(h)]).toEqual([false, false])
    h = commit(h, 'b')
    expect([canUndo(h), canRedo(h)]).toEqual([true, false])
    h = undo(h)
    expect([canUndo(h), canRedo(h)]).toEqual([false, true])
  })

  it('discards redo steps when a new edit is made', () => {
    let h = commit(commit(createHistory('a'), 'b'), 'c')
    h = undo(h)
    h = commit(h, 'x')
    expect(h.future).toEqual([])
    expect(redo(h).present).toBe('x')
  })

  it('ignores an edit that changes nothing', () => {
    const h = createHistory({ n: 1 })
    expect(commit(h, h.present)).toBe(h)
  })

  it('does nothing when there is nothing to undo or redo', () => {
    const h = createHistory('a')
    expect(undo(h)).toEqual(h)
    expect(redo(h)).toBe(h)
  })

  it('caps how many steps are remembered', () => {
    let h = createHistory(0)
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = commit(h, i)
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    expect(h.past[0]).toBe(20) // the oldest were dropped
  })
})

describe('gestures (drags)', () => {
  it('makes a whole drag one undo step', () => {
    let h = createHistory('start')
    h = preview(h, 'a')
    h = preview(h, 'b')
    h = preview(h, 'c')
    expect(h.present).toBe('c')
    h = endGesture(h)
    expect(h.past).toEqual(['start'])
    expect(undo(h).present).toBe('start')
  })

  it('records nothing for a drag that ends where it started', () => {
    let h = createHistory('start')
    h = preview(h, 'moved')
    h = preview(h, 'start')
    h = endGesture(h)
    expect(h.past).toEqual([])
    expect(canUndo(h)).toBe(false)
  })

  it('ignores endGesture when no gesture is running', () => {
    const h = createHistory('a')
    expect(endGesture(h)).toBe(h)
  })

  it('keeps the first starting value if a gesture is begun twice', () => {
    let h = beginGesture(createHistory('a'))
    h = preview(h, 'b')
    h = beginGesture(h)
    h = endGesture(h)
    expect(h.past).toEqual(['a'])
  })

  it('counts undo during a drag as closing the gesture first', () => {
    let h = createHistory('start')
    h = preview(h, 'dragging')
    h = undo(h)
    expect(h.present).toBe('start')
    expect(canRedo(h)).toBe(true)
  })

  it('discards redo steps once a drag lands somewhere new', () => {
    let h = commit(commit(createHistory('a'), 'b'), 'c')
    h = undo(h)
    h = preview(h, 'drag')
    h = endGesture(h)
    expect(h.future).toEqual([])
  })
})
