/**
 * Hash routing: the whole app lives at one URL and the part after # picks the
 * page. That keeps it a static site (no server rewrites) and means every link
 * below works when opened cold, which is what share links need.
 *
 *   #/                 the library
 *   #/drill/<id>       a drill from the library (short, needs the drill in the build)
 *   #/d/<data>         a self-contained drill (see share/codec.ts)
 */
export type Route =
  | { kind: 'library' }
  | { kind: 'drill'; id: string }
  | { kind: 'shared'; data: string }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '')
  const drill = /^\/drill\/(.+)$/.exec(path)
  if (drill) return { kind: 'drill', id: safeDecode(drill[1]) }
  const shared = /^\/d\/(.+)$/.exec(path)
  if (shared) return { kind: 'shared', data: shared[1] }
  return { kind: 'library' }
}

export const libraryHash = () => '#/'
export const drillHash = (id: string) => `#/drill/${encodeURIComponent(id)}`
export const sharedHash = (data: string) => `#/d/${data}`

/** decodeURIComponent throws on a stray % in a hand-typed link; treat it as literal. */
function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}
