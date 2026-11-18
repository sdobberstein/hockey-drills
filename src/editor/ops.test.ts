import { describe, expect, it } from 'vitest'
import { clone, twoOnOne } from '../engine/fixtures'
import { validateDrill } from '../engine/validate'
import {
  addActor,
  blankDrill,
  clampToRink,
  deleteActor,
  moveActor,
  nextActorId,
  parseTags,
  setActorLook,
  setCarrier,
  setDetails,
  slugify,
  uniqueDrillId,
} from './ops'

describe('clampToRink', () => {
  it('keeps points on the ice and rounds to a tenth of a foot', () => {
    expect(clampToRink([-5, 100])).toEqual([0, 85])
    expect(clampToRink([250, -1])).toEqual([200, 0])
    expect(clampToRink([10.04, 20.06])).toEqual([10, 20.1])
  })
})

describe('naming', () => {
  it('numbers players from 1 and objects from the bare name', () => {
    const drill = blankDrill('x')
    expect(nextActorId('forward', drill.actors)).toBe('F1')
    expect(nextActorId('puck', drill.actors)).toBe('puck')
    expect(nextActorId('pylon', twoOnOne.actors)).toBe('pylon')
  })

  it('skips ids that are taken', () => {
    expect(nextActorId('forward', twoOnOne.actors)).toBe('F3')
    expect(nextActorId('puck', twoOnOne.actors)).toBe('puck2')
  })

  it('turns a title into an id and avoids clashes', () => {
    expect(slugify('2-on-1 Rush!')).toBe('2-on-1-rush')
    expect(slugify('  ¡¡  ')).toBe('')
    expect(uniqueDrillId('My Drill', new Set(['my-drill']))).toBe('my-drill-2')
    expect(uniqueDrillId('???', new Set())).toBe('drill')
  })
})

describe('addActor', () => {
  it('adds an actor on the ice with a fresh id, without touching the original', () => {
    const before = clone(twoOnOne)
    const { drill, id } = addActor(before, 'forward', [300, 10])
    expect(id).toBe('F3')
    expect(drill.actors.at(-1)).toEqual({ id: 'F3', type: 'forward', start: [200, 10] })
    expect(before.actors).toHaveLength(4)
  })
})

describe('moveActor', () => {
  it('moves the actor and the first point of its first path, so it does not teleport', () => {
    const moved = moveActor(twoOnOne, 'F2', [100, 55])
    expect(moved.actors.find((a) => a.id === 'F2')!.start).toEqual([100, 55])
    expect(moved.steps[0].moves.find((m) => m.actor === 'F2')!.points![0]).toEqual([100, 55])
    // Only the first point changes; the rest of the route is as drawn.
    expect(moved.steps[0].moves.find((m) => m.actor === 'F2')!.points![1]).toEqual([155, 58])
  })

  it('does not disturb later steps', () => {
    const moved = moveActor(twoOnOne, 'F2', [100, 55])
    expect(moved.steps[2]).toBe(twoOnOne.steps[2])
  })

  it('leaves a drill valid when the moved actor has no moves', () => {
    const moved = moveActor(twoOnOne, 'D', [135, 40])
    expect(validateDrill(moved)).toEqual([])
  })

  it('refuses to move a carried puck on its own', () => {
    expect(moveActor(twoOnOne, 'puck', [10, 10])).toBe(twoOnOne)
  })

  it('moves a carried puck with its carrier', () => {
    const moved = moveActor(twoOnOne, 'F1', [96, 26])
    expect(validateDrill(moved)).toEqual([]) // puck still follows; first path still starts on F1
  })

  it('ignores an unknown actor', () => {
    expect(moveActor(twoOnOne, 'ghost', [1, 1])).toBe(twoOnOne)
  })

  it('keeps the actor on the ice', () => {
    expect(moveActor(twoOnOne, 'D', [999, -9]).actors.find((a) => a.id === 'D')!.start).toEqual([200, 0])
  })
})

describe('setActorLook', () => {
  it('sets and clears a label and colour', () => {
    let d = setActorLook(twoOnOne, 'F1', { label: '9', color: '#c00' })
    expect(d.actors[0]).toMatchObject({ label: '9', color: '#c00' })
    d = setActorLook(d, 'F1', { label: '', color: '' })
    expect('label' in d.actors[0]).toBe(false)
    expect('color' in d.actors[0]).toBe(false)
  })
})

describe('setCarrier', () => {
  it('lets go of a puck, leaving it where its carrier stood', () => {
    const loose = setCarrier(twoOnOne, 'puck', undefined)
    const puck = loose.actors.find((a) => a.id === 'puck')!
    expect(puck.carriedBy).toBeUndefined()
    expect(puck.start).toEqual([95, 25])
  })

  it('hands a puck to another player and puts it where they stand', () => {
    const d = setCarrier(twoOnOne, 'puck', 'F2')
    const puck = d.actors.find((a) => a.id === 'puck')!
    expect(puck).toMatchObject({ carriedBy: 'F2', start: [95, 60] })
  })

  it('only allows a puck to be carried, by a real non-puck player who is not carried', () => {
    expect(setCarrier(twoOnOne, 'F1', 'F2')).toBe(twoOnOne) // not a puck
    expect(setCarrier(twoOnOne, 'puck', 'ghost')).toBe(twoOnOne)
    const second = addActor(twoOnOne, 'puck', [50, 50]).drill
    expect(setCarrier(second, 'puck2', 'puck')).toBe(second) // a puck cannot carry
  })
})

describe('deleteActor', () => {
  it('removes the actor, its moves, and moves aimed at or received by it', () => {
    const d = deleteActor(twoOnOne, 'F2')
    expect(d.actors.map((a) => a.id)).toEqual(['F1', 'D', 'puck'])
    const everyMove = d.steps.flatMap((s) => s.moves)
    expect(everyMove.some((m) => m.actor === 'F2' || m.to === 'F2' || m.receiver === 'F2')).toBe(false)
  })

  it('drops a step that this left empty, but keeps the others', () => {
    // "Walk in" contained only F2's move; "Pass" was aimed at F2.
    const d = deleteActor(twoOnOne, 'F2')
    expect(d.steps.map((s) => s.name)).toEqual(['Attack', 'Shot'])
  })

  it('leaves a carried puck where its carrier stood', () => {
    const d = deleteActor(twoOnOne, 'F1')
    const puck = d.actors.find((a) => a.id === 'puck')!
    expect(puck.carriedBy).toBeUndefined()
    expect(puck.start).toEqual([95, 25])
  })

  it('leaves no dangling references, so the planner can still run', () => {
    for (const id of ['F1', 'F2', 'D', 'puck']) {
      const d = deleteActor(twoOnOne, id)
      const ids = new Set(d.actors.map((a) => a.id))
      for (const move of d.steps.flatMap((s) => s.moves)) {
        expect(ids.has(move.actor)).toBe(true)
        if (typeof move.to === 'string') expect(ids.has(move.to)).toBe(true)
        if (move.receiver) expect(ids.has(move.receiver)).toBe(true)
      }
      for (const a of d.actors) if (a.carriedBy) expect(ids.has(a.carriedBy)).toBe(true)
    }
  })

  it('keeps a step the author left empty on purpose', () => {
    const d = { ...clone(twoOnOne), steps: [...twoOnOne.steps, { moves: [] }] }
    expect(deleteActor(d, 'D').steps.at(-1)).toEqual({ moves: [] })
  })

  it('ignores an unknown actor', () => {
    expect(deleteActor(twoOnOne, 'ghost')).toBe(twoOnOne)
  })
})

describe('setDetails and tags', () => {
  it('edits title and rink view', () => {
    const d = setDetails(twoOnOne, { title: 'Renamed', rink: 'half-right' })
    expect(d).toMatchObject({ title: 'Renamed', rink: 'half-right' })
  })

  it('removes a description or tag list that is emptied', () => {
    const withBoth = setDetails(twoOnOne, { description: 'Hello', tags: ['a'] })
    expect(withBoth).toMatchObject({ description: 'Hello', tags: ['a'] })
    const cleared = setDetails(withBoth, { description: '', tags: [] })
    expect('description' in cleared).toBe(false)
    expect('tags' in cleared).toBe(false)
  })

  it('parses a tag list: trimmed, no blanks, no repeats', () => {
    expect(parseTags(' rush, offence ,, rush ')).toEqual(['rush', 'offence'])
    expect(parseTags('')).toEqual([])
  })
})
