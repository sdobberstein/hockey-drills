import type { Drill } from '../engine/types'
import { creditText, sourceLink } from './source'

/** "Adapted from <original> by <author>, <site>", linking to the original page. Nothing if the drill has no source. */
export function SourceCredit({ drill }: { drill: Drill }) {
  const { source } = drill
  if (!source) return null
  const href = sourceLink(source)
  const text = creditText(source, drill.title)
  return (
    <p className="source">
      Adapted from{' '}
      {href ? (
        // The original is somebody else's page: do not hand it this one (noopener) or tell it where you came from.
        <a href={href} target="_blank" rel="noopener noreferrer">
          {text}
        </a>
      ) : (
        text
      )}
      .
    </p>
  )
}
