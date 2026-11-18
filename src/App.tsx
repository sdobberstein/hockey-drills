import { useState } from 'react'
import { validateDrill } from './engine/validate'
import type { Drill } from './engine/types'
import { Player } from './player/Player'

/**
 * Every drill in drills/, bundled at build time. This is the whole "library"
 * for now (PLAN.md, "Architecture"): files in the repo, no backend.
 *
 * TypeScript sees JSON arrays as number[], so we cast to Drill. The cast is
 * the point where trusted data enters typed code; validateDrill checks what
 * the compiler cannot.
 */
const drills = Object.values(
  import.meta.glob('../drills/*.json', { eager: true, import: 'default' }),
) as Drill[]

export default function App() {
  const [id, setId] = useState(drills[0]?.id)
  const drill = drills.find((d) => d.id === id)

  return (
    <main>
      <header>
        <h1>Hockey Drills</h1>
        <select value={id} onChange={(e) => setId(e.target.value)} aria-label="Drill">
          {drills.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
      </header>

      {drill ? <DrillPage key={drill.id} drill={drill} /> : <p>No drills found in drills/.</p>}
    </main>
  )
}

function DrillPage({ drill }: { drill: Drill }) {
  // A drill that loads but is semantically wrong would animate wrongly, so
  // show the problems instead of playing it.
  const issues = validateDrill(drill)
  if (issues.length > 0) {
    return (
      <section className="issues">
        <h2>{drill.title} has problems</h2>
        <ul>
          {issues.map((issue, i) => (
            <li key={i}>
              <code>{issue.location}</code> {issue.message}
            </li>
          ))}
        </ul>
      </section>
    )
  }

  return (
    <>
      {drill.description && <p className="description">{drill.description}</p>}
      <Player drill={drill} />
    </>
  )
}
