import { libraryHash, drillHash } from './route'
import type { Drill } from '../engine/types'
import { libraryDrills } from '../library/drills'
import { neighbours, seriesTitle } from '../library/library'
import { Player } from '../player/Player'
import { ShareBar } from './ShareBar'

/** A drill with its title, share actions, progression links and player. */
export function DrillScreen({ drill, inLibrary }: { drill: Drill; inLibrary: boolean }) {
  const near = inLibrary ? neighbours(libraryDrills, drill) : null

  return (
    <>
      <nav className="crumbs">
        <a href={libraryHash()}>← Library</a>
        {!inLibrary && <span className="badge">Shared drill, not in the library</span>}
      </nav>

      <h2 className="drill-title">{drill.title}</h2>
      {drill.description && <p className="description">{drill.description}</p>}

      {near && drill.progression && (
        <nav className="progression" aria-label="Progression">
          <span>
            {seriesTitle(drill.progression.series)}: part {near.position} of {near.total}
          </span>
          {near.previous && <a href={drillHash(near.previous.id)}>← {near.previous.title}</a>}
          {near.next && <a href={drillHash(near.next.id)}>{near.next.title} →</a>}
        </nav>
      )}

      <ShareBar drill={drill} inLibrary={inLibrary} />
      <Player drill={drill} />
    </>
  )
}
