/**
 * Hash routing: the whole app lives at one URL and the part after # picks the
 * page. That keeps it a static site (no server rewrites) and means every link
 * below works when opened cold, which is what share links need.
 *
 *   #/                 the library
 *   #/drill/<id>       a drill from the library (short, needs the drill in the build)
 *   #/d/<data>         a self-contained drill (see share/codec.ts)
 *   #/edit/<id>        the editor, on a draft or a copy of a library drill
 *   #/new              start a new drill (becomes #/edit/<id> straight away)
 */
export type Route =
  | { kind: 'library' }
  | { kind: 'drill'; id: string }
  | { kind: 'shared'; data: string }
  | { kind: 'edit'; id: string }
  | { kind: 'new' }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '')
  const drill = /^\/drill\/(.+)$/.exec(path)
  if (drill) return { kind: 'drill', id: safeDecode(drill[1]) }
  const edit = /^\/edit\/(.+)$/.exec(path)
  if (edit) return { kind: 'edit', id: safeDecode(edit[1]) }
  if (path === '/new') return { kind: 'new' }
  const shared = /^\/d\/(.+)$/.exec(path)
  if (shared) return { kind: 'shared', data: shared[1] }
  return { kind: 'library' }
}

export const libraryHash = () => '#/'
export const drillHash = (id: string) => `#/drill/${encodeURIComponent(id)}`
export const sharedHash = (data: string) => `#/d/${data}`
export const editHash = (id: string) => `#/edit/${encodeURIComponent(id)}`
export const newHash = () => '#/new'

/** decodeURIComponent throws on a stray % in a hand-typed link; treat it as literal. */
function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}
