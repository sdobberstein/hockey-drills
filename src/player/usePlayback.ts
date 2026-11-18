import { useCallback, useEffect, useRef, useState } from 'react'

export interface Playback {
  /** Seconds into the drill. */
  time: number
  playing: boolean
  /** Playback speed multiplier (1 = real time). */
  rate: number
  toggle(): void
  seek(t: number): void
  setRate(rate: number): void
}

/**
 * Drives a clock for a drill of `duration` seconds.
 *
 * The hook only owns time. Where everything *is* at that time comes from the
 * engine (Timeline.at), so playing, pausing and scrubbing all just change
 * `time` and the picture follows.
 */
export function usePlayback(duration: number): Playback {
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)

  // The animation loop reads the latest time from a ref, so it does not have
  // to be torn down and restarted on every frame.
  const timeRef = useRef(0)
  const move = useCallback((t: number) => {
    timeRef.current = t
    setTime(t)
  }, [])

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const next = Math.min(timeRef.current + ((now - last) / 1000) * rate, duration)
      last = now
      move(next)
      if (next >= duration) setPlaying(false)
      else frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, rate, duration, move])

  return {
    time,
    playing,
    rate,
    toggle() {
      // Pressing play at the end starts over, like a video player.
      if (!playing && timeRef.current >= duration) move(0)
      setPlaying(!playing)
    },
    seek: (t) => move(Math.min(Math.max(t, 0), duration)),
    setRate,
  }
}
