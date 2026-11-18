import { describe, expect, it } from 'vitest'
import { finishDrawing } from './selection'

describe('finishDrawing', () => {
  it('keeps a route with two or more distinct points', () => {
    expect(finishDrawing({ actor: 'F1', points: [[0, 0], [10, 0], [20, 5]] })).toEqual([[0, 0], [10, 0], [20, 5]])
  })

  it('drops the repeated point a double-click leaves behind', () => {
    expect(finishDrawing({ actor: 'F1', points: [[0, 0], [10, 0], [10, 0.1]] })).toEqual([[0, 0], [10, 0]])
  })

  it('gives nothing for a route that never went anywhere', () => {
    expect(finishDrawing({ actor: 'F1', points: [[5, 5]] })).toBeNull()
    expect(finishDrawing({ actor: 'F1', points: [[5, 5], [5, 5.1]] })).toBeNull()
  })
})
