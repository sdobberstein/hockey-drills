import type { Actor, ActorType, Drill, DrillSource, Point, RinkView } from '../engine/types'
import { clampToRink } from './rink'
import { reanchor } from './routes'

/**
 * Editing operations on a drill. Each is a pure function: it takes a drill and
 * returns a new one, never changing the original. That is what makes undo a
 * simple history of drills (see history.ts), and it means each rule below can
 * be tested without any UI.
 *
 * The recurring job here is keeping references consistent. A drill's moves
 * point at actors by id, so removing or moving an actor must not leave a move
 * pointing at something that is gone or standing somewhere else. Where an
 * edit cannot be made safely, the operation returns the drill unchanged.
 */

// Re-exported so existing imports of clampToRink from here keep working; it lives
// in rink.ts so that routes.ts can use it without importing this module back.
export { clampToRink } from './rink'

export function blankDrill(id: string): Drill {
  return { version: 1, id, title: 'Untitled drill', rink: 'full', actors: [], steps: [] }
}

/** "2-on-1 Rush!" -> "2-on-1-rush". Lower-case words joined by hyphens, as ids must be. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** A free id for a new drill: the slug, or slug-2, slug-3... if taken. */
export function uniqueDrillId(base: string, taken: ReadonlySet<string>): string {
  const slug = slugify(base) || 'drill'
  if (!taken.has(slug)) return slug
  for (let n = 2; ; n++) if (!taken.has(`${slug}-${n}`)) return `${slug}-${n}`
}

/** How new actors of each type are named: F1, F2... for players, puck, puck2... for objects. */
const NAMING: Record<ActorType, { base: string; numberedFromOne: boolean }> = {
  forward: { base: 'F', numberedFromOne: true },
  defender: { base: 'D', numberedFromOne: true },
  goalie: { base: 'G', numberedFromOne: true },
  coach: { base: 'C', numberedFromOne: true },
  puck: { base: 'puck', numberedFromOne: false },
  pucks: { base: 'pucks', numberedFromOne: false },
  pylon: { base: 'pylon', numberedFromOne: false },
  net: { base: 'net', numberedFromOne: false },
}

export function nextActorId(type: ActorType, actors: readonly Actor[]): string {
  const taken = new Set(actors.map((a) => a.id))
  const { base, numberedFromOne } = NAMING[type]
  if (!numberedFromOne && !taken.has(base)) return base
  for (let n = numberedFromOne ? 1 : 2; ; n++) if (!taken.has(`${base}${n}`)) return `${base}${n}`
}

export function addActor(drill: Drill, type: ActorType, at: Point): { drill: Drill; id: string } {
  const id = nextActorId(type, drill.actors)
  return { drill: { ...drill, actors: [...drill.actors, { id, type, start: clampToRink(at) }] }, id }
}

/**
 * Move an actor's starting position.
 *
 * Its first path must still begin where it stands, or the validator would say
 * it teleports at the start of its first move, so routes are re-anchored
 * (see reanchor in routes.ts). A carried actor (a puck on a player) cannot be
 * moved on its own; move its carrier.
 */
export function moveActor(drill: Drill, id: string, to: Point): Drill {
  const actor = drill.actors.find((a) => a.id === id)
  if (!actor || actor.carriedBy) return drill
  const start = clampToRink(to)
  return reanchor({
    ...drill,
    actors: drill.actors.map((a) => (a.id === id ? { ...a, start } : a)),
  })
}

/** Change an actor's label or colour. An empty label or colour clears it. */
export function setActorLook(drill: Drill, id: string, patch: { label?: string; color?: string }): Drill {
  return {
    ...drill,
    actors: drill.actors.map((a) => {
      if (a.id !== id) return a
      const next: Actor = { ...a }
      if (patch.label !== undefined) {
        if (patch.label === '') delete next.label
        else next.label = patch.label
      }
      if (patch.color !== undefined) {
        if (patch.color === '') delete next.color
        else next.color = patch.color
      }
      return next
    }),
  }
}

/**
 * Say which player carries a puck, or set it loose with `undefined`.
 *
 * Mirrors the rules the validator enforces, so the editor cannot build a
 * drill the validator would reject for this: only a puck can be carried, the
 * carrier must be a real player, and a carrier cannot itself be carried.
 */
export function setCarrier(drill: Drill, puckId: string, carrierId: string | undefined): Drill {
  const puck = drill.actors.find((a) => a.id === puckId)
  if (!puck || puck.type !== 'puck') return drill

  if (carrierId === undefined) {
    const { carriedBy: _released, ...loose } = puck
    return { ...drill, actors: drill.actors.map((a) => (a.id === puckId ? loose : a)) }
  }
  const carrier = drill.actors.find((a) => a.id === carrierId)
  if (!carrier || carrier.type === 'puck' || carrier.carriedBy) return drill
  return {
    ...drill,
    // The puck's own start is ignored while carried, but keep it equal to the
    // carrier's so the file reads consistently and un-carrying leaves it there.
    actors: drill.actors.map((a) => (a.id === puckId ? { ...a, carriedBy: carrierId, start: carrier.start } : a)),
  }
}

/**
 * Remove an actor and everything that depended on it:
 * its own moves, moves aimed at it or naming it as receiver, and any puck it
 * was carrying (which stays where the carrier stood). A step left with no
 * moves is dropped, since an empty step is invalid and means nothing.
 */
export function deleteActor(drill: Drill, id: string): Drill {
  if (!drill.actors.some((a) => a.id === id)) return drill
  const carrier = drill.actors.find((a) => a.id === id)!

  const actors = drill.actors
    .filter((a) => a.id !== id)
    .map((a) => {
      if (a.carriedBy !== id) return a
      const { carriedBy: _released, ...loose } = a
      return { ...loose, start: carrier.start }
    })

  const steps = drill.steps
    .map((step) => ({
      ...step,
      moves: step.moves.filter((m) => m.actor !== id && m.to !== id && m.receiver !== id),
    }))
    .filter((step, i) => step.moves.length > 0 || drill.steps[i].moves.length === 0)

  return { ...drill, actors, steps }
}

/** Edit the drill's descriptive fields. Empty text or an empty tag list removes the field. */
export function setDetails(
  drill: Drill,
  patch: { title?: string; description?: string; tags?: string[]; rink?: RinkView },
): Drill {
  const next: Drill = { ...drill }
  if (patch.title !== undefined) next.title = patch.title
  if (patch.rink !== undefined) next.rink = patch.rink
  if (patch.description !== undefined) {
    if (patch.description === '') delete next.description
    else next.description = patch.description
  }
  if (patch.tags !== undefined) {
    if (patch.tags.length === 0) delete next.tags
    else next.tags = patch.tags
  }
  return next
}

/**
 * Edit where the drill came from. The link is what makes it a source, so with no link there is
 * no source at all (whatever else was typed is dropped); the other parts are left out when empty.
 */
export function setSource(drill: Drill, patch: { url?: string; title?: string; author?: string; site?: string }): Drill {
  const merged = { ...drill.source, ...patch }
  const next: Drill = { ...drill }
  const url = (merged.url ?? '').trim()
  if (url === '') {
    delete next.source
    return next
  }
  const source: DrillSource = { url }
  for (const key of ['title', 'author', 'site'] as const) {
    const value = (merged[key] ?? '').trim()
    if (value !== '') source[key] = value
  }
  next.source = source
  return next
}

/** "rush, offence , rush" -> ["rush", "offence"]: trimmed, no blanks, no repeats. */
export function parseTags(text: string): string[] {
  return [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))]
}

/**
 * A copy of a drill ready to be edited as a draft. It keeps its id when that is
 * free, so a draft you made yourself keeps its name. When the id is taken (by a
 * library drill, or a draft you already have) it gets a new one and a "(copy)"
 * title, so opening something never overwrites what is already there.
 */
export function copyForEditing(drill: Drill, taken: ReadonlySet<string>): Drill {
  const copy = structuredClone(drill)
  if (!taken.has(copy.id)) return copy
  copy.id = uniqueDrillId(copy.id, taken)
  copy.title = copy.title.endsWith('(copy)') ? copy.title : `${copy.title} (copy)`
  return copy
}
