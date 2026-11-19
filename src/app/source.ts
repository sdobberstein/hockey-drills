import type { DrillSource } from '../engine/types'

/**
 * The link to show for a drill's source, or null if it should not be a link.
 *
 * A shared drill is whatever the sender put in the link, so its source url is untrusted: a
 * `javascript:` address in an href would run in this page when clicked. The schema already
 * refuses anything but http(s), but a drill can reach the screen without going through the
 * schema (a draft from older storage), so the check is made again where the link is made.
 */
export function sourceLink(source: DrillSource | undefined): string | null {
  if (!source) return null
  try {
    const url = new URL(source.url)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/** The words of the credit: "Cycle Give and Go Drill by Jeremy Weiss, Weiss Tech Hockey". */
export function creditText(source: DrillSource, fallbackTitle: string): string {
  const title = source.title?.trim() || fallbackTitle
  const by = source.author?.trim() ? ` by ${source.author.trim()}` : ''
  const site = source.site?.trim() ? `, ${source.site.trim()}` : ''
  return `${title}${by}${site}`
}
