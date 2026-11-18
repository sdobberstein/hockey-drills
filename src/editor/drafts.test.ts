import { describe, expect, it } from 'vitest'
import { clone, twoOnOne } from '../engine/fixtures'
import { blankDrill } from './ops'
import { deleteDraft, listDrafts, loadDraft, saveDraft, type DraftStorage } from './drafts'

/** An in-memory stand-in for localStorage. */
function fakeStorage(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    get length() {
      return data.size
    },
    key: (i) => [...data.keys()][i] ?? null,
  }
}

describe('drafts', () => {
  it('saves and loads a draft', () => {
    const s = fakeStorage()
    expect(saveDraft(twoOnOne, s)).toBe(true)
    expect(loadDraft('2-on-1', s)).toEqual(twoOnOne)
  })

  it('keeps a draft that is not yet a valid drill (no steps)', () => {
    const s = fakeStorage()
    const draft = blankDrill('work-in-progress')
    saveDraft(draft, s)
    expect(loadDraft('work-in-progress', s)).toEqual(draft)
  })

  it('returns null for a missing draft', () => {
    expect(loadDraft('nope', fakeStorage())).toBeNull()
  })

  it('ignores stored data that is not a drill', () => {
    const s = fakeStorage()
    s.setItem('hockey-drills:draft:x', '{"hello": 1}')
    s.setItem('hockey-drills:draft:y', 'not json at all')
    expect(loadDraft('x', s)).toBeNull()
    expect(loadDraft('y', s)).toBeNull()
  })

  it('ignores a draft stored under the wrong id', () => {
    const s = fakeStorage()
    s.setItem('hockey-drills:draft:other', JSON.stringify(twoOnOne))
    expect(loadDraft('other', s)).toBeNull()
  })

  it('deletes a draft', () => {
    const s = fakeStorage()
    saveDraft(twoOnOne, s)
    deleteDraft('2-on-1', s)
    expect(loadDraft('2-on-1', s)).toBeNull()
  })

  it('lists only drafts, sorted by title', () => {
    const s = fakeStorage()
    s.setItem('unrelated', 'x')
    saveDraft({ ...clone(twoOnOne), id: 'b', title: 'Bravo' }, s)
    saveDraft({ ...clone(twoOnOne), id: 'a', title: 'Alpha' }, s)
    expect(listDrafts(s).map((d) => d.title)).toEqual(['Alpha', 'Bravo'])
  })

  it('copes with storage that throws, as private windows can', () => {
    const broken: DraftStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('full')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
      length: 1,
      key: () => {
        throw new Error('blocked')
      },
    }
    expect(saveDraft(twoOnOne, broken)).toBe(false)
    expect(loadDraft('2-on-1', broken)).toBeNull()
    expect(listDrafts(broken)).toEqual([])
    expect(() => deleteDraft('2-on-1', broken)).not.toThrow()
  })

  it('copes with no storage at all', () => {
    expect(saveDraft(twoOnOne, null)).toBe(false)
    expect(loadDraft('2-on-1', null)).toBeNull()
    expect(listDrafts(null)).toEqual([])
  })
})
