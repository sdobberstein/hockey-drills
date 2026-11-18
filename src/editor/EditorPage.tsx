import { useEffect, useMemo, useRef, useState } from 'react'
import { downloadDrill } from '../app/share'
import { drillHash, libraryHash } from '../app/route'
import { Issues } from '../app/Issues'
import { parseDrill } from '../engine/parse'
import { initialState, planDrill } from '../engine/plan'
import type { ActorType, Drill, MoveStyle, Point } from '../engine/types'
import { editViaFlow } from '../flow/apply'
import { moveLanding, moveRelease, removeWait, setRunSeconds, setWaitSeconds, type Starts } from '../flow/edit'
import { drillToFlow } from '../flow/import'
import { appendRun, pathEnd, removeRun, setRunPoints } from '../flow/pathEdit'
import { addPass, believable, endMarker, explain, followers, landingZones, locateOnPath, removePass, snapToLanding } from '../flow/passEdit'
import { pointAlong } from '../engine/geometry'
import { buildTimelineModel, carrierAtTime, puckCarriedBy } from '../flow/view'
import type { After, EventTarget, Marker } from '../flow/types'
import { segmentsFor } from '../flow/timeline'
import type { Flow } from '../flow/types'
import { Timeline, type DragPhase } from '../flow/TimelineView'
import { libraryDrills } from '../library/drills'
import { Player } from '../player/Player'
import { ActorPanel } from './ActorPanel'
import { PassPanel } from './PassPanel'
import { PiecePanel } from './PiecePanel'
import { deleteDraft, loadDraft } from './drafts'
import { DetailsPanel } from './DetailsPanel'
import { EditStage } from './EditStage'
import { FlowStage, type PassClick, type StagePhase, type VertexGrab } from './FlowStage'
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
  // Two ways to work on the same drill: step by step, or as one path per skater.
  const [mode, setMode] = useState<'steps' | 'flow'>('steps')
  // A pass being linked in the flow view, after its first click (where it leaves).
  const [passDraft, setPassDraft] = useState<{ puck: string; from: Marker | After; carrier: string; time: number; point: Point } | null>(null)
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
  const flow = useMemo(() => drillToFlow(drill), [drill])
  const starts = useMemo<Starts>(() => Object.fromEntries(drill.actors.map((a) => [a.id, a.start])), [drill])
  // Passes and shots, shown faint under the paths in the flow view.
  const flights = useMemo(
    () =>
      (plan?.steps ?? [])
        .flatMap((s) => s.moves.filter((m) => m.releases))
        .map((m, index) => ({ index, style: m.style, path: m.path })),
    [plan],
  )
  const model = useMemo(() => buildTimelineModel(drill), [drill])
  // Once a pass's release is chosen: where on the other skaters' paths it could land. A shot goes
  // to the net, so it has none.
  const zones = useMemo(
    () =>
      flow && passDraft && routeStyle !== 'shoot'
        ? landingZones(flow, starts, { point: passDraft.point, time: passDraft.time }, passDraft.carrier)
        : [],
    [flow, starts, passDraft, routeStyle],
  )
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
    setPassDraft(null)
    setRouteStyle(null)
  }
  const goTo = (next: number | null) => {
    setView(next)
    setSelection(null)
    setMessage('')
    stopDrawing()
    setArmed(null)
  }

  const switchMode = (next: 'steps' | 'flow') => {
    setMode(next)
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
    if (!points) stopDrawing()
    else if (mode === 'flow') commitFlowRun(points)
    else commitDrawing(points)
  }

  /**
   * Apply an edit made on the timeline. The drill is turned into its flow, the
   * flow is edited, and the result is compiled back into steps; an edit that
   * would break something (a receiver arriving before the pass leaves, a run
   * starting while a pass is in the air) is refused with the reason.
   */
  const flowEdit = (edit: (flow: Flow, starts: Starts) => Flow | null, phase: DragPhase | 'once' = 'once'): Drill | null => {
    const base = phase === 'move' ? dragBase.current : drill
    if (!base) return null
    const result = editViaFlow(base, edit)
    if (!result) {
      setMessage('That change is not possible here: it would need a speed nobody skates, or something that is not on the timeline.')
      return null
    }
    if (result.added.length > 0) {
      // The most specific reason first: "the receiver arrives before the pass leaves"
      // says more than the validator's resulting complaint about the puck.
      const reason = result.added.find((p) => p.code !== 'drill-invalid') ?? result.added[0]
      setMessage(reason.message)
      return null
    }
    setMessage('')
    if (phase === 'move') editor.preview(result.drill)
    else editor.edit(result.drill)
    return result.drill
  }

  /** Add a run to the end of a skater's path, then select it. */
  const commitFlowRun = (points: readonly Point[]) => {
    if (!drawing || routeStyle === null) return
    const { actor } = drawing
    stopDrawing()
    const next = flowEdit((f, s) => appendRun(f, s, actor, routeStyle, points))
    if (!next) return
    const pieces = drillToFlow(next)?.paths[actor] ?? []
    const last = pieces.map((p) => p.kind).lastIndexOf('run')
    if (last >= 0) setSelection({ kind: 'piece', actor, piece: last })
  }

  /**
   * The two clicks that link a pass in the flow view: where it leaves (on the
   * passer's path), then where it lands (on the receiver's path, on a skater, or
   * on the ice). Everything else, the speed included, follows from those.
   */
  const onPassClick = (hit: PassClick) => {
    if (!flow || !model || routeStyle === null) return
    const style = routeStyle

    if (!passDraft) {
      if (hit.kind === 'ice') {
        setMessage('Click on a skater\'s path where the pass should leave.')
        return
      }
      const actor = hit.kind === 'path' ? hit.actor : hit.id
      let marker: Marker
      let time: number
      let point: Point
      if (hit.kind === 'path') {
        const located = locateOnPath(flow, starts, actor, hit.point)
        if (!located) return
        marker = located.marker
        time = located.time
        point = hit.point
      } else {
        // Clicking the skater themselves means from where they start.
        if (!flow.paths[actor]?.length) {
          setMessage(`${actor} has no path yet. Draw a run for them, then click it where the pass should leave.`)
          return
        }
        marker = { actor, piece: 0, at: 0 }
        time = 0
        point = starts[actor]
      }

      const puck = puckCarriedBy(model, actor, time)
      if (!puck) {
        const holder = model.pucks.map((p) => carrierAtTime(model, p.actor, time)).find(Boolean)
        setMessage(holder ? `${actor} does not have the puck at ${time.toFixed(2)} s; ${holder} does.` : `Nobody has the puck at ${time.toFixed(2)} s: it is in the air or loose.`)
        return
      }
      // At the instant a pass lands on this skater, it is a release taken as the puck arrives.
      const fed = model.links.findIndex((l, j) => flow.events[j]?.puck === puck && l.to.actor === actor && Math.abs(l.to.t - time) <= 0.15)
      setSelection(null)
      setPassDraft({ puck, from: fed >= 0 ? { after: fed } : marker, carrier: actor, time, point })
      // If other skaters have paths but none works from here, say so now rather than after a bad click.
      const others = Object.entries(flow.paths).filter(([id, pieces]) => id !== actor && pieces.some((p) => p.kind === 'run'))
      const reachable = style === 'shoot' || others.length === 0 || landingZones(flow, starts, { point, time }, actor).length > 0
      setMessage(reachable ? '' : `From here no other skater's path works for a pass: they get there too soon, or it would need an impossible speed. Release earlier or later on ${actor}'s path, or click the ice for a loose pass.`)
      return
    }

    // Second click: where it lands. A landing that cannot work is moved onto the nearest one that
    // can, or explained, so there is never a message that says "pick somewhere believable" and
    // leaves you to guess where that is.
    const from = { point: passDraft.point, time: passDraft.time }
    // Said after the edit, since a successful edit clears the message.
    let note = ''
    const checks = style !== 'shoot'
    const markerPointOf = (m: Marker): Point => {
      const seg = segmentsFor(flow.paths[m.actor] ?? [], starts[m.actor])[m.piece]
      return seg ? (seg.piece.kind === 'wait' ? seg.from : pointAlong(seg.geometry, m.at)) : starts[m.actor]
    }
    const landOn = (actor: string, marker: Marker, time: number, aimed: Point): EventTarget | null => {
      if (!checks) return { kind: 'marker', marker }
      const verdict = believable(from, markerPointOf(marker), time)
      if (verdict.ok) return { kind: 'marker', marker }
      const snap = snapToLanding(zones, aimed, 20, actor)
      if (snap) {
        note = `That spot did not work for the pass, so it lands at the nearest one that does on ${actor}'s path.`
        return { kind: 'marker', marker: snap.marker }
      }
      setMessage(explain(verdict, actor, passDraft.carrier))
      return null
    }

    let target: EventTarget | null
    if (hit.kind === 'path') {
      if (hit.actor === passDraft.carrier) {
        setMessage('Click a different skater\'s path, or the ice.')
        return
      }
      const located = locateOnPath(flow, starts, hit.actor, hit.point)
      if (!located) return
      target = landOn(hit.actor, located.marker, located.time, hit.point)
    } else if (hit.kind === 'actor') {
      if (hit.id === passDraft.carrier) return
      const end = endMarker(flow, starts, hit.id)
      target = end ? landOn(hit.id, end.marker, end.time, starts[hit.id]) : { kind: 'point', at: starts[hit.id], receiver: hit.id }
    } else {
      // On the ice: near a green stretch means "that area"; anywhere else is a loose pass.
      const snap = checks ? snapToLanding(zones, hit.point, 7) : null
      target = snap ? { kind: 'marker', marker: snap.marker } : { kind: 'point', at: clampToRink(hit.point) }
    }
    if (!target) return

    const draft = passDraft
    stopDrawing()
    const next = flowEdit((f) => addPass(f, { puck: draft.puck, style, from: draft.from, target }))
    if (!next) return
    if (note) setMessage(note)
    // Select the pass just made: the one that leaves at the moment that was clicked.
    const made = buildTimelineModel(next)?.links.findIndex((l) => Math.abs(l.from.t - draft.time) <= 0.02 && l.from.actor === draft.carrier)
    if (made !== undefined && made >= 0) setSelection({ kind: 'pass', link: made })
  }

  /** A drag of a point on a run in the flow view. A new point is inserted first, then dragged. */
  const stageVertex = (g: VertexGrab, to: Point, phase: StagePhase) => {
    const edit = (f: Flow, s: Starts) => {
      const piece = f.paths[g.actor]?.[g.piece]
      if (piece?.kind !== 'run') return null
      let pts: readonly Point[] = piece.points
      if (g.insertAfter !== undefined && g.insertAt) pts = insertPoint(pts, g.insertAfter, g.insertAt)
      return setRunPoints(f, s, g.actor, g.piece, movePoint(pts, g.index, clampToRink(to)))
    }
    timelineDrag(phase, edit)
    // A new point appears as soon as you grab the ring, not only once you move.
    if (phase === 'start' && g.insertAfter !== undefined) timelineDrag('move', edit)
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
        } else if (selection?.kind === 'pass') {
          e.preventDefault()
          if (flow && followers(flow, selection.link).length > 0) setMessage('A shot is taken as this pass arrives. Delete that first.')
          else {
            flowEdit((f) => removePass(f, selection.link))
            setSelection(null)
          }
        } else if (selection?.kind === 'piece') {
          e.preventDefault()
          const kind = flow?.paths[selection.actor]?.[selection.piece]?.kind
          flowEdit((f, s) => (kind === 'run' ? removeRun(f, s, selection.actor, selection.piece) : removeWait(f, s, selection.actor, selection.piece)))
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
        <span className="modes" role="group" aria-label="View">
          <button type="button" aria-pressed={mode === 'steps'} className={mode === 'steps' ? 'active' : undefined} onClick={() => switchMode('steps')}>
            Steps view
          </button>
          <button type="button" aria-pressed={mode === 'flow'} className={mode === 'flow' ? 'active' : undefined} onClick={() => switchMode('flow')}>
            Flow view
          </button>
        </span>
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
          {mode === 'flow' && flow ? (
            <FlowStage
              drill={drill}
              flow={flow}
              starts={starts}
              flights={flights}
              selection={selection}
              armed={armed}
              routeTool={routeStyle !== null}
              drawing={drawing}
              onSelect={(next) => {
                setSelection(next)
                setMessage('')
                if (next?.kind === 'piece' || next?.kind === 'pass') stopDrawing()
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
              passTool={releaseTool}
              passFrom={passDraft?.point ?? null}
              zones={zones}
              onPassClick={onPassClick}
              onRunStart={(actor) => {
                const who = drill.actors.find((a) => a.id === actor)
                if (who?.type === 'puck' || who?.carriedBy) setMessage('Runs are for skaters. A puck moves with whoever carries it, or by a pass.')
                else {
                  setMessage('')
                  setSelection(null)
                  setDrawing({ actor, points: [pathEnd(flow, starts, actor)] })
                }
              }}
              onDrawPoint={(at) => setDrawing((d) => (d ? { ...d, points: [...d.points, clampToRink(at)] } : d))}
              onFinishDrawing={finish}
              onVertex={stageVertex}
              onVertexRemove={(actor, piece, index) =>
                flowEdit((f, s) => {
                  const run = f.paths[actor]?.[piece]
                  return run?.kind === 'run' ? setRunPoints(f, s, actor, piece, removePoint(run.points, index)) : null
                })
              }
            />
          ) : (
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
          )}
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
            {selection?.kind === 'pass' && <PassPanel key={selection.link} drill={drill} link={selection.link} onEdit={(edit) => flowEdit(edit)} />}
            {selection?.kind === 'piece' && (
              <PiecePanel key={`${selection.actor}-${selection.piece}`} drill={drill} actor={selection.actor} piece={selection.piece} onEdit={(edit) => flowEdit(edit)} />
            )}
            {/* Stops here are hints about steps; in the flow view they are explicit waits on the timeline. */}
            {mode === 'steps' && (
              <SmoothnessPanel
              drill={drill}
              onEdit={editor.edit}
              onShow={(s, actor) => {
                goTo(s)
                setSelection({ kind: 'route', step: s, actor })
              }}
            />
            )}
            {mode === 'flow' ? (
              <>
                <Palette armed={armed} onArm={setArmed} />
                <RouteTools
                  armed={routeStyle}
                  drawing={drawing !== null || passDraft !== null}
                  flow
                  onArm={(s) => {
                    setRouteStyle(s)
                    setDrawing(null)
                    setMessage('')
                  }}
                />
              </>
            ) : (
              <>
                <StepList drill={drill} planSteps={plan?.steps ?? []} view={step} onView={goTo} onEdit={editor.edit} />
                {step === null ? (
                  <Palette armed={armed} onArm={setArmed} />
                ) : (
                  <RouteTools armed={routeStyle} drawing={drawing !== null} onArm={(s) => { setRouteStyle(s); setDrawing(null); setMessage('') }} />
                )}
              </>
            )}
            <DetailsPanel drill={drill} onEdit={editor.edit} />
          </aside>
        </div>
      )}
    </div>
  )
}
