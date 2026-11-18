import { useState } from 'react'
import { parseDrill, type ParseIssue } from '../engine/parse'
import { encode } from '../share/codec'
import { Issues } from './Issues'
import { sharedHash } from './route'

/**
 * Open a drill that is not in the library: choose a .json file or paste JSON.
 * It goes through parseDrill like any outside drill; if it is valid we turn it
 * into a self-contained link and navigate there, so the result is shareable
 * and survives a refresh.
 */
export function OpenDrill() {
  const [text, setText] = useState('')
  const [issues, setIssues] = useState<ParseIssue[]>([])

  const open = async (source: string) => {
    let json: unknown
    try {
      json = JSON.parse(source)
    } catch {
      setIssues([{ code: 'schema', location: 'text', message: 'is not valid JSON.' }])
      return
    }
    const result = parseDrill(json)
    if (!result.drill) {
      setIssues(result.issues)
      return
    }
    setIssues([])
    window.location.hash = sharedHash(await encode(result.drill))
  }

  return (
    <section className="open">
      <h2>Open a drill</h2>
      <p>Choose a drill file, or paste its JSON. It opens as a shareable link; nothing is uploaded.</p>
      <input
        type="file"
        accept="application/json,.json"
        aria-label="Drill file"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (file) await open(await file.text())
          e.target.value = ''
        }}
      />
      <textarea
        aria-label="Drill JSON"
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='{"version": 1, "id": "my-drill", ...}'
      />
      <button type="button" disabled={text.trim() === ''} onClick={() => open(text)}>
        Open pasted JSON
      </button>
      {issues.length > 0 && <Issues title="That drill has problems" issues={issues} />}
    </section>
  )
}
