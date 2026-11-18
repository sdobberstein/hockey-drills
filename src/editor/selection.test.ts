import { describe, expect, it } from 'vitest'
import { finishDrawing } from './selection'

describe('finishDrawing', () => {
  it('keeps a route with two or more distinct points', () => {
    expect(finishDrawing({ actor: 'F1', points: [[0, 0], [10, 0], [20, 5]] })).toEqual([[0, 0], [10, 0], [20, 5]])
  })

  it('drops the repeated point a double-click leaves behind', () => {
    expect(finishDrawing({ actor: 'F1', points: [[0, 0], [10, 0], [10, 0.1]] })).toEqual([[0, 0], [10, 0]])
  })

  it('drops the hop a double-click leaves when the pointer moves a few pixels between presses', () => {
    // 0.4 ft is what the reported pivot and lateral runs ended with.
    expect(finishDrawing({ actor: 'F1', points: [[0, 0], [10, 0], [10.4, 0]] })).toEqual([[0, 0], [10, 0]])
    expect(finishDrawing({ actor: 'F1', points: [[0, 0], [10, 0], [10.1, 0.3]] })).toEqual([[0, 0], [10, 0]])
  })

  it('still keeps a short but real final segment', () => {
    expect(finishDrawing({ actor: 'F1', points: [[0, 0], [10, 0], [12, 0]] })).toEqual([[0, 0], [10, 0], [12, 0]])
  })

  it('gives nothing for a route that never went anywhere', () => {
    expect(finishDrawing({ actor: 'F1', points: [[5, 5]] })).toBeNull()
    expect(finishDrawing({ actor: 'F1', points: [[5, 5], [5, 5.1]] })).toBeNull()
  })
})
