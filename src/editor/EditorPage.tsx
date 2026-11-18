import { useEffect, useMemo, useRef, useState } from 'react'
import { downloadDrill } from '../app/share'
import { drillHash, libraryHash } from '../app/route'
import { Issues } from '../app/Issues'
import { parseDrill } from '../engine/parse'
import { initialState, planDrill } from '../engine/plan'
import type { ActorType, Drill, MoveStyle, Point } from '../engine/types'
import { editViaFlow } from '../flow/apply'
import { moveLanding, moveRelease, removeWait, setRunSeconds, setWaitSeconds, type Starts } from '../flow/edit'
import { segmentsFor } from '../flow/timeline'
import type { Flow } from '../flow/types'
import { Timeline, type DragPhase } from '../flow/TimelineView'
import { libraryDrills } from '../library/drills'
import { Player } from '../player/Player'
import { ActorPanel } from './ActorPanel'
import { PiecePanel } from './PiecePanel'
import { deleteDraft, loadDraft } from './drafts'
import { DetailsPanel } from './DetailsPanel'
import { EditStage } from './EditStage'
import { addActor, deleteActor, moveActor } from './ops'
import { clampToRink } from './rink'
import { addRelease, applySuggestion, deleteMove, findMove, RELEASE_STYLES, reshapeRoute, setLanding, tieToRunEnd } from './releases'
import { addRoute, findRoute, insertPoint, movePoint, removePoint } from './routes'
import { RoutePanel } from './RoutePanel'
import { RouteTools } from './RouteTools'
import { finishDrawing, type Drawing, type Selection } from './selection'
import { SmoothnessPanel } from './SmoothnessPanel'
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
  // The drill as it was when a timeline drag began: every step of the drag is
  // worked out from it, so the result depends only on where the pointer is now.
  const dragBase = useRef<Drill | null>(null)

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
  const selectedMove = selection?.kind === 'route' ? findMove(drill, selection.step, selection.actor) : undefined
  // A pass, shot or drop pass is a move of the puck; everything else is a route.
  const releaseTool = routeStyle !== null && RELEASE_STYLES.includes(routeStyle)
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

  /** Add the move being drawn, then select it. `receiver` is set when a pass ended on a teammate. */
  const commitDrawing = (points: readonly Point[], receiver?: string) => {
    if (!drawing || step === null || routeStyle === null) return
    stopDrawing()
    let next = drill
    if (releaseTool) {
      if (receiver !== undefined && points.length === 2) {
        // Aimed at a teammate: if they are skating, land the pass where their run ends and set
        // its speed so the puck arrives as they do, so there is nothing to work out by hand.
        next = tieToRunEnd(addRelease(drill, step, drawing.actor, routeStyle, { kind: 'actor', id: receiver }), step, drawing.actor)
      } else if (points.length === 2) {
        next = addRelease(drill, step, drawing.actor, routeStyle, { kind: 'point', at: points[1] })
      } else {
        next = addRelease(drill, step, drawing.actor, routeStyle, { kind: 'path', points }, receiver)
      }
    } else {
      next = addRoute(drill, step, drawing.actor, routeStyle, points)
    }
    if (next === drill) {
      setMessage(`Could not add that for ${drawing.actor}.`)
      return
    }
    editor.edit(next)
    setSelection({ kind: 'route', step, actor: drawing.actor })
  }

  const finish = () => {
    if (!drawing) return
    const points = finishDrawing(drawing)
    if (points) commitDrawing(points)
    else stopDrawing()
  }

  /**
   * Apply an edit made on the timeline. The drill is turned into its flow, the
   * flow is edited, and the result is compiled back into steps; an edit that
   * would break something (a receiver arriving before the pass leaves, a run
   * starting while a pass is in the air) is refused with the reason.
   */
  const flowEdit = (edit: (flow: Flow, starts: Starts) => Flow | null, phase: DragPhase | 'once' = 'once') => {
    const base = phase === 'move' ? dragBase.current : drill
    if (!base) return
    const result = editViaFlow(base, edit)
    if (!result) {
      setMessage('That change is not possible here: it would need a speed nobody skates, or something that is not on the timeline.')
      return
    }
    if (result.added.length > 0) {
      // The most specific reason first: "the receiver arrives before the pass leaves"
      // says more than the validator's resulting complaint about the puck.
      const reason = result.added.find((p) => p.code !== 'drill-invalid') ?? result.added[0]
      setMessage(reason.message)
      return
    }
    setMessage('')
    if (phase === 'move') editor.preview(result.drill)
    else editor.edit(result.drill)
  }

  const timelineDrag = (phase: DragPhase, edit: (flow: Flow, starts: Starts) => Flow | null) => {
    if (phase === 'start') dragBase.current = drill
    else if (phase === 'end') {
      dragBase.current = null
      editor.endGesture()
    } else flowEdit(edit, 'move')
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
          editor.edit(deleteMove(drill, selection.step, selection.actor))
          setSelection(null)
        } else if (selection?.kind === 'piece') {
          e.preventDefault()
          flowEdit((f, s) => removeWait(f, s, selection.actor, selection.piece))
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
    // reshapeRoute also moves any pass that was landing at the end of this run.
    const next = reshapeRoute(drill, selection.step, selection.actor, change(selectedRoute.points))
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
          <div className="stage-col">
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
              // Choosing an existing move means you want to edit it, not draw another.
              if (next?.kind === 'route') stopDrawing()
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
              if (releaseTool) {
                // Clicking the puck, or the player carrying it, starts a release.
                const carried = plan?.steps[step]?.before.carriers
                const puck = who?.type === 'puck' ? who.id : [...(carried ?? [])].find(([, carrier]) => carrier === actor)?.[0]
                if (!puck || !carried?.has(puck)) setMessage('Click the player who has the puck.')
                else if (drill.steps[step].moves.some((m) => m.actor === puck)) {
                  // Do not leave a dead end: select the move that is in the way so it can be edited.
                  stopDrawing()
                  setSelection({ kind: 'route', step, actor: puck })
                  setMessage('The puck already moves in this step, so that one is selected for you to edit. Delete it to draw a different one.')
                }
                else {
                  setMessage('')
                  setSelection(null)
                  setDrawing({ actor: puck, points: [positions[puck] ?? from] })
                }
                return
              }
              if (who?.carriedBy) setMessage(`${actor} is carried; it moves with ${who.carriedBy}. Draw a route for ${who.carriedBy}.`)
              else if (drill.steps[step].moves.some((m) => m.actor === actor)) {
                stopDrawing()
                setSelection({ kind: 'route', step, actor })
                setMessage(`${actor} already has a move in this step, so it is selected for you to edit. Delete it to draw a different one.`)
              }
              else {
                setMessage('')
                setSelection(null)
                setDrawing({ actor, points: [from] })
              }
            }}
            onDrawPoint={(at, onActor) => {
              if (!drawing) return
              // A pass ends the moment you click a teammate: that is who it is for.
              if (releaseTool && onActor && onActor !== drawing.actor && !drill.actors.find((a) => a.id === onActor)?.carriedBy) {
                commitDrawing([...drawing.points, clampToRink(at)], onActor)
                return
              }
              setDrawing({ ...drawing, points: [...drawing.points, clampToRink(at)] })
            }}
            onFinishDrawing={finish}
            onVertexDrag={(index, to) => reshape((pts) => movePoint(pts, index, clampToRink(to)), true)}
            onVertexInsert={(after, at) => reshape((pts) => insertPoint(pts, after, clampToRink(at)), true)}
            onVertexRemove={(index) => reshape((pts) => removePoint(pts, index), false)}
            onLandingDrag={(to) => {
              if (selection?.kind === 'route') editor.preview(setLanding(drill, selection.step, selection.actor, clampToRink(to)))
            }}
            onVertexDragEnd={editor.endGesture}
          />
            <Timeline
              drill={drill}
              editing={{
                selected: selection?.kind === 'piece' ? { actor: selection.actor, piece: selection.piece } : null,
                onSelect: (piece) => setSelection(piece ? { kind: 'piece', ...piece } : null),
                onResize: (actor, piece, t, phase) =>
                  timelineDrag(phase, (flow, starts) => {
                    const list = flow.paths[actor]
                    const seg = list && segmentsFor(list, starts[actor])[piece]
                    if (!seg) return null
                    return seg.piece.kind === 'wait'
                      ? setWaitSeconds(flow, starts, actor, piece, t - seg.t0)
                      : setRunSeconds(flow, starts, actor, piece, t - seg.t0)
                  }),
                onMoveEnd: (link, which, t, phase) =>
                  timelineDrag(phase, (flow, starts) => (which === 'from' ? moveRelease(flow, starts, link, t) : moveLanding(flow, starts, link, t))),
              }}
            />
          </div>
          <aside className="panels">
            {selectedActor && <ActorPanel key={selectedActor.id} drill={drill} actor={selectedActor} onEdit={editor.edit} />}
            {selection?.kind === 'route' && selectedMove && (
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
            {result.issues.length > 0 && (
              <Issues
                title="To finish this drill"
                issues={result.issues}
                onApply={(issue, choice) => editor.edit(applySuggestion(drill, issue.location, choice))}
              />
            )}
            {selection?.kind === 'piece' && (
              <PiecePanel key={`${selection.actor}-${selection.piece}`} drill={drill} actor={selection.actor} piece={selection.piece} onEdit={(edit) => flowEdit(edit)} />
            )}
            <SmoothnessPanel
              drill={drill}
              onEdit={editor.edit}
              onShow={(s, actor) => {
                goTo(s)
                setSelection({ kind: 'route', step: s, actor })
              }}
            />
            <StepList drill={drill} planSteps={plan?.steps ?? []} view={step} onView={goTo} onEdit={editor.edit} />
            {step === null ? (
              <Palette armed={armed} onArm={setArmed} />
            ) : (
              <RouteTools armed={routeStyle} drawing={drawing !== null} onArm={(s) => { setRouteStyle(s); setDrawing(null); setMessage('') }} />
            )}
            <DetailsPanel drill={drill} onEdit={editor.edit} />
          </aside>
        </div>
      )}
    </div>
  )
}
