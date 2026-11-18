import { useEffect, useMemo, useState } from 'react'
import { downloadDrill } from '../app/share'
import { drillHash, libraryHash } from '../app/route'
import { Issues } from '../app/Issues'
import { parseDrill } from '../engine/parse'
import type { ActorType, Drill } from '../engine/types'
import { libraryDrills } from '../library/drills'
import { Player } from '../player/Player'
import { ActorPanel } from './ActorPanel'
import { deleteDraft, loadDraft } from './drafts'
import { DetailsPanel } from './DetailsPanel'
import { EditStage } from './EditStage'
import { addActor, deleteActor, moveActor } from './ops'
import { Palette } from './Palette'
import { useEditor } from './useEditor'

/** The editor for a draft, or for a copy of a library drill. */
export function EditorPage({ id }: { id: string }) {
  const inLibrary = libraryDrills.some((d) => d.id === id)
  // A saved draft wins over the library file it was copied from.
  const initial = useMemo(() => loadDraft(id) ?? libraryDrills.find((d) => d.id === id) ?? null, [id])

  if (!initial) {
    return (
      <p>
        There is no drill or draft called “{id}”. <a href={libraryHash()}>Back to the library</a>.
      </p>
    )
  }
  return <Editor key={id} initial={initial} inLibrary={inLibrary} />
}

function Editor({ initial, inLibrary }: { initial: Drill; inLibrary: boolean }) {
  const editor = useEditor(initial)
  const { drill } = editor
  const [selected, setSelected] = useState<string | null>(null)
  const [armed, setArmed] = useState<ActorType | null>(null)
  const [previewing, setPreviewing] = useState(false)

  const selectedActor = drill.actors.find((a) => a.id === selected) ?? null
  const result = useMemo(() => parseDrill(drill), [drill])
  const valid = result.drill !== null

  // Keyboard: undo/redo, delete, nudge. Ignored while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) editor.redo()
        else editor.undo()
      } else if (mod && key === 'y') {
        e.preventDefault()
        editor.redo()
      } else if (e.key === 'Escape') {
        setArmed(null)
      } else if (selectedActor && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault()
        editor.edit(deleteActor(drill, selectedActor.id))
        setSelected(null)
      } else if (selectedActor && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const amount = e.shiftKey ? 5 : 1
        const dx = e.key === 'ArrowRight' ? amount : e.key === 'ArrowLeft' ? -amount : 0
        const dy = e.key === 'ArrowDown' ? amount : e.key === 'ArrowUp' ? -amount : 0
        const [x, y] = selectedActor.start
        editor.edit(moveActor(drill, selectedActor.id, [x + dx, y + dy]))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drill, selectedActor, editor])

  const discard = () => {
    if (!window.confirm('Discard this draft? Your changes will be lost.')) return
    deleteDraft(drill.id)
    window.location.hash = inLibrary ? drillHash(drill.id) : libraryHash()
  }

  return (
    <div className="editor-page">
      <nav className="crumbs">
        <a href={libraryHash()}>← Library</a>
        <span className="badge">
          {inLibrary ? 'Editing a copy: the library file is unchanged until you commit the download' : 'Draft'}
        </span>
      </nav>

      <div className="toolbar" role="toolbar" aria-label="Editor">
        <button type="button" onClick={editor.undo} disabled={!editor.canUndo}>
          Undo
        </button>
        <button type="button" onClick={editor.redo} disabled={!editor.canRedo}>
          Redo
        </button>
        <button type="button" onClick={() => setPreviewing(!previewing)} disabled={!valid && !previewing}>
          {previewing ? 'Back to editing' : 'Preview'}
        </button>
        <button
          type="button"
          onClick={() => result.drill && downloadDrill(result.drill)}
          disabled={!valid}
          title={valid ? undefined : 'Fix the problems first'}
        >
          Download JSON
        </button>
        <button type="button" className="danger" onClick={discard}>
          Discard draft
        </button>
        <span className="status" role="status">
          {editor.status === 'saved' && 'Draft saved'}
          {editor.status === 'failed' && 'Could not save a draft (browser storage is unavailable)'}
        </span>
      </div>

      {previewing && result.drill ? (
        <Player drill={result.drill} />
      ) : (
        <div className="editor">
          <EditStage
            drill={drill}
            selected={selected}
            armed={armed}
            onSelect={setSelected}
            onPlace={(at) => {
              if (!armed) return
              const { drill: next, id } = addActor(drill, armed, at)
              editor.edit(next)
              setSelected(id)
              setArmed(null)
            }}
            onDrag={(id, to) => editor.preview(moveActor(drill, id, to))}
            onDragEnd={editor.endGesture}
          />
          <aside className="panels">
            <Palette armed={armed} onArm={setArmed} />
            {selectedActor && <ActorPanel key={selectedActor.id} drill={drill} actor={selectedActor} onEdit={editor.edit} />}
            <DetailsPanel drill={drill} onEdit={editor.edit} />
            {result.issues.length > 0 && (
              <Issues title="To finish this drill" issues={result.issues} />
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

