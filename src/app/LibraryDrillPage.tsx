import { parseDrill } from '../engine/parse'
import { libraryDrills } from '../library/drills'
import { DrillScreen } from './DrillScreen'
import { Issues } from './Issues'
import { libraryHash } from './route'

/** A drill from the library, found by id. */
export function LibraryDrillPage({ id }: { id: string }) {
  const drill = libraryDrills.find((d) => d.id === id)
  if (!drill) {
    return (
      <p>
        There is no drill called “{id}”. <a href={libraryHash()}>Back to the library</a>.
      </p>
    )
  }
  // The library test guards the files, but a drill that is somehow wrong
  // would animate wrongly, so show the problems instead of playing it.
  const { issues } = parseDrill(drill)
  if (issues.length > 0) return <Issues title={`${drill.title} has problems`} issues={issues} />
  return <DrillScreen key={drill.id} drill={drill} inLibrary />
}
