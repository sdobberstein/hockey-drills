import { useMemo } from 'react'
import { buildTimeline, headingsAt, stepIndexAt } from '../engine/timeline'
import type { Drill } from '../engine/types'
import { Timeline } from '../flow/TimelineView'
import { DrillView } from '../render/DrillView'
import { Controls } from './Controls'
import { usePlayback } from './usePlayback'

/** A drill you can play, pause, scrub and step through. */
export function Player({ drill }: { drill: Drill }) {
  // Building the timeline resolves every move, so do it once per drill.
  const timeline = useMemo(() => buildTimeline(drill), [drill])
  const playback = usePlayback(timeline.duration)
  const activeStep = stepIndexAt(timeline.plan, playback.time)
  const skaters = useMemo(() => drill.actors.filter((a) => a.type !== 'puck').map((a) => a.id), [drill])

  return (
    <div className="player">
      <DrillView
        drill={drill}
        plan={timeline.plan}
        frame={timeline.at(playback.time)}
        activeStep={activeStep}
        headings={headingsAt(timeline, skaters, playback.time)}
      />
      <Controls plan={timeline.plan} playback={playback} activeStep={activeStep} />
      <Timeline drill={drill} time={playback.time} onSeek={playback.seek} />
    </div>
  )
}
