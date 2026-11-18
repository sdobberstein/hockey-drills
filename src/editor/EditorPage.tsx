import { useEffect, useMemo, useState } from 'react'
import { downloadDrill } from '../app/share'
import { drillHash, libraryHash } from '../app/route'
import { Issues } from '../app/Issues'
import { parseDrill } from '../engine/parse'
import { initialState, planDrill } from '../engine/plan'
import type { ActorType, Drill, MoveStyle, Point } from '../engine/types'
import { libraryDrills } from '../library/drills'
import { Player } from '../player/Player'
import { ActorPanel } from './ActorPanel'
import { deleteDraft, loadDraft } from './drafts'
import { DetailsPanel } from './DetailsPanel'
import { EditStage } from './EditStage'
import { addActor, deleteActor, moveActor } from './ops'
import { clampToRink } from './rink'
import { addRoute, deleteRoute, findRoute, insertPoint, movePoint, removePoint, setRoutePoints } from './routes'
import { RoutePanel } from './RoutePanel'
import { RouteTools } from './RouteTools'
import { finishDrawing, type Drawing, type Selection } from './selection'
import { StepList } from './StepList'
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
  // null is Setup (starting positions); a number is the step being edited.
  const [view, setView] = useState<number | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [armed, setArmed] = useState<ActorType | null>(null)
  const [routeStyle, setRouteStyle] = useState<MoveStyle | null>(null)
  const [drawing, setDrawing] = useState<Drawing | null>(null)
  const [message, setMessage] = useState('')
  const [previewing, setPreviewing] = useState(false)

  // Steps can be deleted from under the view; never point past the end.
  const step = view === null || drill.steps.length === 0 ? null : Math.min(view, drill.steps.length - 1)

  const plan = useMemo(() => {
    try {
      return planDrill(drill)
    } catch {
      return null // a drill that cannot be planned still shows its actors
    }
  }, [drill])
  const positions = useMemo(() => {
    const at = step !== null && plan?.steps[step] ? plan.steps[step].before.positions : initialState(drill).positions
    return Object.fromEntries(at)
  }, [drill, plan, step])

  const selectedActor = selection?.kind === 'actor' ? (drill.actors.find((a) => a.id === selection.id) ?? null) : null
  const selectedRoute = selection?.kind === 'route' ? findRoute(drill, selection.step, selection.actor) : undefined
  const result = useMemo(() => parseDrill(drill), [drill])
  const valid = result.drill !== null

  const stopDrawing = () => {
    setDrawing(null)
    setRouteStyle(null)
  }
  const goTo = (next: number | null) => {
    setView(next)
    setSelection(null)
    setMessage('')
    stopDrawing()
    setArmed(null)
  }

  const finish = () => {
    if (!drawing || step === null || routeStyle === null) return
    const points = finishDrawing(drawing)
    stopDrawing()
    if (!points) return
    const next = addRoute(drill, step, drawing.actor, routeStyle, points)
    if (next === drill) {
      setMessage(`Could not add that route for ${drawing.actor}.`)
      return
    }
    editor.edit(next)
    setSelection({ kind: 'route', step, actor: drawing.actor })
  }

  // Keyboard: undo/redo, finish/cancel, delete, nudge. Ignored while typing in a field.
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
      } else if (e.key === 'Enter' && drawing) {
        e.preventDefault()
        finish()
      } else if (e.key === 'Escape') {
        setArmed(null)
        stopDrawing()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedActor) {
          e.preventDefault()
          editor.edit(deleteActor(drill, selectedActor.id))
          setSelection(null)
        } else if (selection?.kind === 'route') {
          e.preventDefault()
          editor.edit(deleteRoute(drill, selection.step, selection.actor))
          setSelection(null)
        }
      } else if (selectedActor && step === null && e.key.startsWith('Arrow')) {
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
  })

  const discard = () => {
    if (!window.confirm('Discard this draft? Your changes will be lost.')) return
    deleteDraft(drill.id)
    window.location.hash = inLibrary ? drillHash(drill.id) : libraryHash()
  }

  // Reshape the selected route. A drag passes gesture=true so it previews as one undo step.
  const reshape = (change: (points: readonly Point[]) => readonly Point[], gesture: boolean) => {
    if (selection?.kind !== 'route' || !selectedRoute) return
    const next = setRoutePoints(drill, selection.step, selection.actor, change(selectedRoute.points))
    if (gesture) editor.preview(next)
    else editor.edit(next)
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
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}

      {previewing && result.drill ? (
        <Player drill={result.drill} />
      ) : (
        <div className="editor">
          <EditStage
            drill={drill}
            step={step}
            positions={positions}
            planSteps={plan?.steps ?? []}
            selection={selection}
            armed={armed}
            routeTool={routeStyle !== null}
            drawing={drawing}
            onSelect={(next) => {
              setSelection(next)
              setMessage('')
            }}
            onPlace={(at) => {
              if (!armed) return
              const { drill: next, id } = addActor(drill, armed, at)
              editor.edit(next)
              setSelection({ kind: 'actor', id })
              setArmed(null)
            }}
            onActorDrag={(id, to) => editor.preview(moveActor(drill, id, to))}
            onActorDragEnd={editor.endGesture}
            onRouteStart={(actor, from) => {
              if (step === null) return
              const who = drill.actors.find((a) => a.id === actor)
              if (who?.carriedBy) setMessage(`${actor} is carried; it moves with ${who.carriedBy}. Draw a route for ${who.carriedBy}.`)
              else if (drill.steps[step].moves.some((m) => m.actor === actor)) setMessage(`${actor} already has a move in this step. Select its route to edit it.`)
              else {
                setMessage('')
                setSelection(null)
                setDrawing({ actor, points: [from] })
              }
            }}
            onDrawPoint={(at) => setDrawing((d) => (d ? { ...d, points: [...d.points, clampToRink(at)] } : d))}
            onFinishDrawing={finish}
            onVertexDrag={(index, to) => reshape((pts) => movePoint(pts, index, clampToRink(to)), true)}
            onVertexInsert={(after, at) => reshape((pts) => insertPoint(pts, after, clampToRink(at)), true)}
            onVertexRemove={(index) => reshape((pts) => removePoint(pts, index), false)}
            onVertexDragEnd={editor.endGesture}
          />
          <aside className="panels">
            <StepList drill={drill} planSteps={plan?.steps ?? []} view={step} onView={goTo} onEdit={editor.edit} />
            {step === null ? (
              <Palette armed={armed} onArm={setArmed} />
            ) : (
              <RouteTools armed={routeStyle} drawing={drawing !== null} onArm={(s) => { setRouteStyle(s); setDrawing(null); setMessage('') }} />
            )}
            {selectedActor && <ActorPanel key={selectedActor.id} drill={drill} actor={selectedActor} onEdit={editor.edit} />}
            {selection?.kind === 'route' && selectedRoute && (
              <RoutePanel
                key={`${selection.step}-${selection.actor}`}
                drill={drill}
                step={selection.step}
                actor={selection.actor}
                planned={plan?.steps[selection.step]?.moves.find((m) => m.actor === selection.actor)}
                stepDuration={plan?.steps[selection.step]?.duration ?? 0}
                onEdit={editor.edit}
              />
            )}
            <DetailsPanel drill={drill} onEdit={editor.edit} />
            {result.issues.length > 0 && <Issues title="To finish this drill" issues={result.issues} />}
          </aside>
        </div>
      )}
    </div>
  )
}
