import { useEffect, useState } from 'react'
import { parseDrill, type ParseIssue } from '../engine/parse'
import type { Drill } from '../engine/types'
import { decode } from '../share/codec'
import { DrillScreen } from './DrillScreen'
import { Issues } from './Issues'

type State =
  | { status: 'loading' }
  | { status: 'ready'; drill: Drill }
  | { status: 'error'; issues: ParseIssue[] }

/** A drill carried inside the link. Treated as untrusted until parseDrill passes it. */
export function SharedPage({ data }: { data: string }) {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    decode(data)
      .then((json) => {
        if (cancelled) return
        const result = parseDrill(json)
        setState(result.drill ? { status: 'ready', drill: result.drill } : { status: 'error', issues: result.issues })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'Could not read the link.'
        setState({ status: 'error', issues: [{ code: 'schema', location: 'link', message }] })
      })
    return () => {
      cancelled = true
    }
  }, [data])

  if (state.status === 'loading') return <p>Loading…</p>
  if (state.status === 'error') return <Issues title="This link could not be opened" issues={state.issues} />
  return <DrillScreen key={state.drill.id} drill={state.drill} inLibrary={false} />
}
