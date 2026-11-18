# Hockey Drills: Plan

Personal-use web app for creating, animating and sharing hockey drills. Planning document only; no code yet.

## Decisions

| Area | Decision |
|---|---|
| Audience | Personal use |
| Platform | Static web app, no backend |
| Stack | TypeScript, Vite, React |
| Rendering | SVG (same renderer for editor, player and static diagram) |
| Rink | NHL, 200 x 85 ft. Coordinates in feet, x 0..200, y 0..85 |
| Data | Local-first JSON, one file per drill |
| Library | `drills/*.json` in the repo; generated `index.json`; app lists and loads them |
| Sharing | Hash links: `#/drill/<id>` and `#/d/<compressed-json>` |
| Animation | Model C: ordered steps, each containing moves |
| Progressions | Independent drill files linked by `progression` metadata |
| Paths | Straight segments by default; optional `smooth` flag curves a path through its points |
| Out of scope | 3D, teams, practice plans, MP4 export, server-side library |

## Prior art (summary)

- **HockeyShare**: full suite, 2D/3D, animation, MP4/PNG export, AI setup, large library.
- **DrillFlow**: closest to our model; typed lines, per-line speed, start delays, share links, no account.
- **BenchIQ**: step-based animation with onion-skin; AI builder.
- **Hockey Coach Vision, JB_Drill, Ice Hockey Systems, Hockey Canada Drill Hub**: older or library-focused.
- **BoardX** (GitHub): open-source keyframe tactic board.
- **International Drill Symbols** (Hockey Eastern Ontario): the notation we adopt.

Differentiators: open versioned JSON format with a public schema, standard-notation static diagrams, local-first with no accounts, and structural pass timing (steps) instead of hand-tuned delays.

## Symbol set (International Drill Symbols)

Actors: coach (circled C), goalie (G), forward (filled/hollow circle), defender (filled/hollow triangle), end-of-rep position (dashed variant), pylon (X), puck cluster.

Move styles: skate (solid arrow), backward (wavy), lateral (tick ladder), pivot (wavy with hook), skate-puck (sine wave), pass (dashed arrow), shoot (double-line arrow), stop (line to double bar), drop-pass (wave with tick), check (line ending in T).

## Data model

```
Drill
  version: 1
  id, title, description?, tags[]
  rink: "full" | "half-right" | "half-left" | "half-top" | "half-bottom"
  progression?: { series, order }
  actors[]: { id, type, label?, color?, start:[x,y], carriedBy? }
  steps[]:  { name?, notes?, moves[] }
  move:     { actor, style, speed?, points[] | to, receiver?, smooth? }
```

Rules:
- A step lasts as long as its slowest move; actors not mentioned stay put.
- A move has either `points` (a path) or `to` (an actor id or a point). Passes and shots normally use `to`.
- `carriedBy` on an actor (typically the puck) makes it follow that actor until a pass or shot moves it. A pass with `to: <actorId>` hands the puck to that actor on arrival.
- All moves in a step start together, from the positions at the start of that step. A released puck (pass, shot, drop-pass) leaves from where its carrier stood when the step began, and the carrier is free to keep skating. If you want a shot to leave from where the carrier *ends up*, put the shot in the next step ("walk in", then "shoot").
- Passes can be received in stride. `receiver` names who picks the puck up when the release ends (implied when `to` is an actor id). The receiver may be skating; the validator checks they are within 2.5 ft of the landing spot at the instant the puck arrives, and the error says how far off the timing is. A bank off the boards is a pass with `points` (the bounce is a vertex) and a `receiver`.
- Steps are sync points: a step ends when its slowest move ends. For continuous skating with no pause, split an actor's path across steps at the same speed, so each segment finishes just as the step does.
- `speed` is in ft/s; each style has a default.
- `rink` is a view crop; coordinates are always full-rink.
- `smooth: true` rounds a `points` path into a smooth curve through the same points (a centripetal Catmull-Rom spline, densified into a polyline by the engine), so a curve's length, and therefore its duration, is the curve's own length. It does not apply to `to` moves.

Semantic checks beyond the JSON Schema: unknown actor ids, a pass whose puck has no carrier, `to` referencing a missing actor, duplicate actor ids, and series/order collisions across the library.

Playback is a pure function `(drill, t) -> positions`. No DOM, fully unit-testable.

### Example: 2-on-1

```json
{
  "version": 1,
  "id": "2-on-1",
  "title": "2-on-1 Rush",
  "tags": ["rush", "offence"],
  "rink": "full",
  "progression": { "series": "two-on-one", "order": 2 },
  "actors": [
    { "id": "F1", "type": "forward",  "start": [95, 25] },
    { "id": "F2", "type": "forward",  "start": [95, 60] },
    { "id": "D",  "type": "defender", "start": [140, 42] },
    { "id": "puck", "type": "puck",   "start": [95, 25], "carriedBy": "F1" }
  ],
  "steps": [
    { "name": "Attack", "moves": [
      { "actor": "F1", "style": "skate-puck", "speed": 25, "points": [[95,25],[150,28]] },
      { "actor": "F2", "style": "skate",      "speed": 25, "points": [[95,60],[155,58]] },
      { "actor": "D",  "style": "backward",   "speed": 12, "points": [[140,42],[150,38]] }
    ]},
    { "name": "Pass", "moves": [
      { "actor": "puck", "style": "pass", "speed": 60, "to": "F2" }
    ]},
    { "name": "Walk in", "moves": [
      { "actor": "F2", "style": "skate-puck", "speed": 15, "points": [[155,58],[165,55]] }
    ]},
    { "name": "Shot", "moves": [
      { "actor": "puck", "style": "shoot", "speed": 80, "to": [189, 42] }
    ]}
  ]
}
```

## Architecture

Three views over one model:
- **Editor**: place actors, draw and edit paths, manage steps, undo/redo.
- **Player**: animate with play, pause, scrub, speed.
- **Diagram**: static render in international notation, all steps overlaid and numbered.

Library: `drills/*.json`, a build step generates `index.json` (id, title, tags, progression). The library view groups by series and sorts by order. The editor has "Save as new drill from this one" for authoring progression steps.

Persistence: drafts in localStorage/IndexedDB; import/export `.json`; committing a file to `drills/` is how a drill joins the library.

Sharing: repo drills by id; any drill via deflate + base64url in the URL fragment.

## Build order

1. **Model and engine**: JSON Schema, semantic validator, position-at-time function, tests with the 2-on-1 fixture.
2. **Viewer**: rink SVG, actor and line symbols, load a JSON file and animate it.
3. **Library and share links**: index generation, drill list, hash routing, progression grouping.
4. **Editor**: actors, paths, steps, undo/redo, save-as-new.
5. **Static diagram and PNG export.**
6. **Later**: GIF export, more rink views, practice-plan view, `extends` for progressions if duplication becomes painful.

The viewer comes before the editor so the model can be judged with hand-written drills before the largest piece of UI is built.

## Deferred / revisit

- Progression inheritance via `extends` (additive; existing files stay valid).
- IIHF rink size.
- GIF export.
- Queues of waiting players and rep rotation (the source diagrams show a pile of players per line).
- Smoothing of `to` moves (only `points` paths are smoothed).

## Authoring helpers for passes in stride

A pass in stride ties four numbers together: where the puck leaves (the carrier's position at the start of the step), the landing spot, the pass speed (which fixes how long the puck is in the air), and where the receiver is at that moment (their route and speed). Written by hand, you work backwards: pass length / pass speed = time in the air; receiver speed x that time = distance the receiver must have covered; so the receiver must start the step that far before the landing spot, which in turn sizes the paths in the previous step. Change one number and the rest must be redone.

Three levels of help, each building on the one before:

1. **Validator hints** (built). When `receiver-misses-pass` fires, the issue also carries a `suggestion` and the message says what it is:
   - `passSpeed`: a speed that makes the puck arrive as the receiver does, offered when the receiver's route already passes through the landing spot. Works for any pass, including a bank.
   - `landAt`: a landing spot where puck and receiver can arrive together, offered for straight passes only (moving the end of a bent pass would leave the bend pointing the wrong way).
2. **Solver functions in the engine** (partly built). `landingSpot` (src/engine/receive.ts) already solves "where should a straight pass land so puck and skating receiver arrive together", by bisection, because moving the landing spot also changes the flight time. Still to build: the other direction (given a landing spot and a receiver route, what pass speed or start position lines up), the receiver-start-position solve ("where must they be at the start of the step"), and doing it for bank passes. The editor would call these, and so could a CLI that adjusts a hand-written drill.
3. **Editor snapping** (not built; belongs to build step 4, the editor). Drag the landing spot or the receiver's route and the timing adjusts automatically: the receiver's start of the pass step, or the pass speed, is re-solved so the pass keeps landing on them. The author edits positions, never timing numbers. Open question: which quantity should the editor hold fixed when something moves (pass speed, the receiver's start, or the landing spot); a sensible default is to keep speeds fixed and move positions, with an override.

Related, if hand-computed timing keeps hurting: because steps are sync points, an actor's path often has to be split across steps at one speed. The editor could present a single continuous path per actor and split it at step boundaries itself.
