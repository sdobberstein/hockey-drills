import { describe, expect, it } from 'vitest'
import { clone, twoOnOne } from '../engine/fixtures'
import { parseDrill } from '../engine/parse'
import { validateDrill } from '../engine/validate'
import { addActor, blankDrill, moveActor } from './ops'
import {
  addRoute,
  addStep,
  deleteRoute,
  deleteStep,
  findRoute,
  insertPoint,
  moveStep,
  movePoint,
  reanchor,
  removePoint,
  renameStep,
  ROUTE_STYLES,
  setRoutePoints,
  updateRoute,
} from './routes'

describe('reanchor', () => {
  it('leaves a consistent drill exactly as it is', () => {
    expect(reanchor(twoOnOne)).toBe(twoOnOne)
  })

  it('makes a route start where its actor really is', () => {
    const d = clone(twoOnOne)
    d.steps[2].moves[0] = { actor: 'F2', style: 'skate-puck', speed: 15, points: [[1, 1], [165, 55]] }
    const fixed = reanchor(d)
    expect(findRoute(fixed, 2, 'F2')!.points[0]).toEqual([155, 58]) // where Attack left F2
    expect(findRoute(fixed, 2, 'F2')!.points[1]).toEqual([165, 55]) // the rest is untouched
  })

  it('keeps unchanged steps as the same objects', () => {
    const d = clone(twoOnOne)
    d.steps[2].moves[0] = { actor: 'F2', style: 'skate-puck', speed: 15, points: [[1, 1], [165, 55]] }
    const fixed = reanchor(d)
    expect(fixed.steps[0]).toBe(d.steps[0])
    expect(fixed.steps[3]).toBe(d.steps[3])
  })

  it('leaves a drill with broken references alone instead of crashing', () => {
    const d = clone(twoOnOne)
    d.steps[0].moves[0].actor = 'ghost'
    expect(reanchor(d)).toBe(d)
  })
})

describe('steps', () => {
  it('adds, names and renames a step', () => {
    let d = addStep(twoOnOne, 'Extra')
    expect(d.steps.at(-1)).toEqual({ name: 'Extra', moves: [] })
    d = renameStep(d, 4, 'Renamed')
    expect(d.steps[4].name).toBe('Renamed')
    d = renameStep(d, 4, '')
    expect('name' in d.steps[4]).toBe(false)
  })

  it('deletes a step and re-anchors what followed', () => {
    // Without "Attack", F2 has not moved yet, so "Walk in" must start at its start.
    const d = deleteStep(twoOnOne, 0)
    expect(d.steps.map((s) => s.name)).toEqual(['Pass', 'Walk in', 'Shot'])
    expect(findRoute(d, 1, 'F2')!.points[0]).toEqual([95, 60])
  })

  it('moves a step earlier or later and re-anchors', () => {
    const d = moveStep(twoOnOne, 1, 1) // swap Pass and Walk in
    expect(d.steps.map((s) => s.name)).toEqual(['Attack', 'Walk in', 'Pass', 'Shot'])
  })

  it('does not move a step past either end', () => {
    expect(moveStep(twoOnOne, 0, -1)).toBe(twoOnOne)
    expect(moveStep(twoOnOne, 3, 1)).toBe(twoOnOne)
  })

  it('ignores a step that does not exist', () => {
    expect(deleteStep(twoOnOne, 9)).toBe(twoOnOne)
    expect(renameStep(twoOnOne, 9, 'x')).toBe(twoOnOne)
  })
})

describe('addRoute', () => {
  const withEmptyStep = addStep(twoOnOne, 'Rebound')

  it('adds a route for an actor who has no move in that step', () => {
    const d = addRoute(withEmptyStep, 4, 'D', 'backward', [[0, 0], [160, 38]])
    expect(findRoute(d, 4, 'D')).toMatchObject({ style: 'backward' })
  })

  it('takes the first point from where the actor really is, whatever was passed', () => {
    const d = addRoute(withEmptyStep, 4, 'D', 'backward', [[0, 0], [160, 38]])
    expect(findRoute(d, 4, 'D')!.points[0]).toEqual([150, 38]) // where Attack left D
  })

  it('refuses when the actor already has a move in that step', () => {
    expect(addRoute(twoOnOne, 0, 'F1', 'skate', [[0, 0], [10, 10]])).toBe(twoOnOne)
  })

  it('refuses a carried puck, an unknown actor or step, a release style, or one point', () => {
    expect(addRoute(withEmptyStep, 4, 'puck', 'skate', [[0, 0], [1, 1]])).toBe(withEmptyStep)
    expect(addRoute(withEmptyStep, 4, 'ghost', 'skate', [[0, 0], [1, 1]])).toBe(withEmptyStep)
    expect(addRoute(withEmptyStep, 9, 'D', 'skate', [[0, 0], [1, 1]])).toBe(withEmptyStep)
    expect(addRoute(withEmptyStep, 4, 'D', 'pass', [[0, 0], [1, 1]])).toBe(withEmptyStep)
    expect(addRoute(withEmptyStep, 4, 'D', 'skate', [[0, 0]])).toBe(withEmptyStep)
  })

  it('keeps points on the ice', () => {
    const d = addRoute(withEmptyStep, 4, 'D', 'skate', [[150, 38], [999, -5]])
    expect(findRoute(d, 4, 'D')!.points[1]).toEqual([200, 0])
  })

  it('offers only route styles, not the puck releases', () => {
    expect(ROUTE_STYLES).toContain('skate')
    expect(ROUTE_STYLES).not.toContain('pass')
    expect(ROUTE_STYLES).not.toContain('shoot')
    expect(ROUTE_STYLES).not.toContain('drop-pass')
  })
})

describe('editing a route', () => {
  it('moving where a route ends re-anchors the actor\'s next route', () => {
    // F2's Attack route ends at 155,58; "Walk in" then starts there.
    const d = setRoutePoints(twoOnOne, 0, 'F2', [[95, 60], [150, 62]])
    expect(findRoute(d, 0, 'F2')!.points[1]).toEqual([150, 62])
    expect(findRoute(d, 2, 'F2')!.points[0]).toEqual([150, 62])
  })

  it('changes style, speed and smoothing, and clears them again', () => {
    let d = updateRoute(twoOnOne, 0, 'F2', { style: 'backward', speed: 9, smooth: true })
    expect(findRoute(d, 0, 'F2')).toMatchObject({ style: 'backward', speed: 9, smooth: true })
    d = updateRoute(d, 0, 'F2', { speed: null, smooth: false })
    expect('speed' in findRoute(d, 0, 'F2')!).toBe(false)
    expect('smooth' in findRoute(d, 0, 'F2')!).toBe(false)
  })

  it('refuses a release style or a non-positive speed', () => {
    expect(updateRoute(twoOnOne, 0, 'F2', { style: 'pass' })).toBe(twoOnOne)
    expect(updateRoute(twoOnOne, 0, 'F2', { speed: 0 })).toBe(twoOnOne)
    expect(updateRoute(twoOnOne, 0, 'F2', { speed: -3 })).toBe(twoOnOne)
  })

  it('deletes a route and re-anchors the actor\'s later routes', () => {
    const d = deleteRoute(twoOnOne, 0, 'F2')
    expect(findRoute(d, 0, 'F2')).toBeUndefined()
    expect(findRoute(d, 2, 'F2')!.points[0]).toEqual([95, 60]) // F2 never left its start
  })

  it('ignores a route that does not exist', () => {
    expect(deleteRoute(twoOnOne, 0, 'D2')).toBe(twoOnOne)
    // The puck has no route in step 0 (it is carried), so there is nothing to edit.
    expect(setRoutePoints(twoOnOne, 0, 'puck', [[1, 1], [2, 2]])).toBe(twoOnOne)
  })

  it('refuses to shrink a route below two points', () => {
    expect(setRoutePoints(twoOnOne, 0, 'F2', [[95, 60]])).toBe(twoOnOne)
  })

  it('moving an actor\'s start still re-anchors its first route', () => {
    const d = moveActor(twoOnOne, 'F2', [100, 55])
    expect(findRoute(d, 0, 'F2')!.points[0]).toEqual([100, 55])
  })
})

describe('waypoints', () => {
  const line = [[0, 0], [10, 0], [20, 0]] as const

  it('inserts a point between two others', () => {
    expect(insertPoint(line, 0, [5, 3])).toEqual([[0, 0], [5, 3], [10, 0], [20, 0]])
    expect(insertPoint(line, 1, [15, 3])).toEqual([[0, 0], [10, 0], [15, 3], [20, 0]])
  })

  it('removes a middle point but never the ends or below two points', () => {
    expect(removePoint(line, 1)).toEqual([[0, 0], [20, 0]])
    expect(removePoint(line, 0)).toEqual([...line])
    expect(removePoint(line, 2)).toEqual([...line])
    expect(removePoint([[0, 0], [1, 1]], 1)).toEqual([[0, 0], [1, 1]])
  })

  it('moves one point', () => {
    expect(movePoint(line, 1, [10, 5])).toEqual([[0, 0], [10, 5], [20, 0]])
  })
})

describe('building a drill only from editing operations', () => {
  it('produces a drill that passes full validation', () => {
    let d = blankDrill('built-by-hand')
    d = addActor(d, 'forward', [50, 20]).drill
    d = addActor(d, 'defender', [120, 40]).drill
    d = addStep(d, 'Go')
    d = addRoute(d, 0, 'F1', 'skate', [[0, 0], [100, 20], [110, 30]])
    d = updateRoute(d, 0, 'F1', { smooth: true, speed: 22 })
    d = addStep(d, 'Back')
    d = addRoute(d, 1, 'D1', 'backward', [[0, 0], [130, 40]])

    const result = parseDrill(d)
    expect(result.issues).toEqual([])
    expect(result.drill).not.toBeNull()
    expect(validateDrill(d)).toEqual([])
  })
})
