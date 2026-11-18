import { useState } from 'react'
import { parseDrill, type ParseIssue } from '../engine/parse'
import type { Drill } from '../engine/types'
import { encode } from '../share/codec'
import { Issues } from './Issues'
import { sharedHash } from './route'
import { startEditing } from './share'

/**
 * Bring in a drill that is not in the library: choose a .json file (such as one you
 * downloaded from the editor) or paste its JSON. It goes through parseDrill like any
 * outside drill. If it is valid you choose what to do with it: look at it as a
 * shareable link, or make a draft of it and edit it. Nothing is uploaded.
 */
export function OpenDrill() {
  const [text, setText] = useState('')
  const [issues, setIssues] = useState<ParseIssue[]>([])
  const [loaded, setLoaded] = useState<Drill | null>(null)

  const load = (source: string) => {
    setLoaded(null)
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
    setLoaded(result.drill)
  }

  return (
    <section className="open">
      <h2>Open a drill</h2>
      <p>Choose a drill file (like one you downloaded from the editor), or paste its JSON. Nothing is uploaded.</p>
      <input
        type="file"
        accept="application/json,.json"
        aria-label="Drill file"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (file) load(await file.text())
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
      <button type="button" disabled={text.trim() === ''} onClick={() => load(text)}>
        Read pasted JSON
      </button>

      {loaded && (
        <div className="loaded" role="status">
          <p>
            Loaded <strong>{loaded.title}</strong>. What would you like to do with it?
          </p>
          <button
            type="button"
            onClick={async () => {
              window.location.hash = sharedHash(await encode(loaded))
            }}
          >
            View it
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              if (!startEditing(loaded)) window.alert('Could not make a draft: this browser is not letting the app save anything.')
            }}
          >
            Edit a copy
          </button>
        </div>
      )}
      {issues.length > 0 && <Issues title="That drill has problems" issues={issues} />}
    </section>
  )
}
