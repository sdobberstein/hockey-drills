import { useState } from 'react'
import type { Drill } from '../engine/types'
import { copyText, downloadDrill, libraryLink, selfContainedLink } from './share'

/**
 * Share actions for a drill. A drill in the library has a short link by id;
 * any drill can also be shared as a self-contained link that carries the whole
 * drill, which works for drills that are not in the build (see share/codec.ts).
 */
export function ShareBar({ drill, inLibrary }: { drill: Drill; inLibrary: boolean }) {
  const [status, setStatus] = useState('')

  const copy = async (make: () => string | Promise<string>, label: string) => {
    try {
      await copyText(await make())
      setStatus(`${label} copied`)
    } catch {
      setStatus('Could not copy; your browser blocked clipboard access.')
    }
    setTimeout(() => setStatus(''), 2500)
  }

  return (
    <div className="sharebar">
      {inLibrary && (
        <button type="button" onClick={() => copy(() => libraryLink(drill.id), 'Link')}>
          Copy link
        </button>
      )}
      <button type="button" onClick={() => copy(() => selfContainedLink(drill), 'Self-contained link')}>
        Copy self-contained link
      </button>
      <button type="button" onClick={() => downloadDrill(drill)}>
        Download JSON
      </button>
      <span className="status" role="status">
        {status}
      </span>
    </div>
  )
}
