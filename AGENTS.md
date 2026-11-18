# AGENTS.md

Guidance for AI agents (and humans) working in this repo. Read `PLAN.md` first: it holds the decisions, the data model and the build order.

## Project in one paragraph

A personal-use, static web app (TypeScript, Vite, React, SVG) for creating, animating and sharing hockey drills. Drills are local-first JSON files in `drills/`, validated against `schema/drill.schema.json`. No backend. Out of scope: 3D, teams, practice plans, MP4 export.

## Commits

We use **small, conventional commits**.

- **Small**: one logical change per commit. If the message needs "and", it is probably two commits. Each commit should leave the project building and tests passing.
- **Conventional**: `type(scope): summary`, imperative mood, summary 72 characters or fewer, no trailing period.
  - Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `style`, `perf`.
  - Scopes (suggested): `schema`, `engine`, `render`, `editor`, `library`, `share`, `drills`, `docs`.
  - Example: `feat(engine): compute step duration from slowest move`
- **Tests with code**: a behaviour change and its test go in the same commit.
- Do not commit generated output (`dist/`, `node_modules/`) or half-finished work.

### Teaching commit bodies

Commits are also a record the owner learns from. For anything non-trivial, add a body that explains **why**, not just what:

- the problem or constraint that motivated the change,
- the alternative(s) considered and why they lost,
- any concept worth knowing (e.g. "a step lasts as long as its slowest move, so pass timing is structural rather than a hand-tuned delay").

Trivial commits (typo, formatting) can be a single line.

## Teaching comments in code

Write comments that teach, in the same spirit:

- Explain **why** and **how it fits the model**, not what the next line obviously does.
- When code encodes a domain or design rule (units in feet, `carriedBy` semantics, step timing, coordinate system), say so at the point it is used.
- Link to the relevant section of `PLAN.md` where it helps.
- Keep them accurate. A stale teaching comment is worse than none; update or delete it when the code changes.
- Do not narrate trivial code or restate identifiers.

## Conventions

- Coordinates are always full-rink feet: x 0..200, y 0..85. Rink "half" views are crops, not different coordinate systems.
- The playback engine is a pure function `(drill, t) -> positions`, with no DOM access, so it is unit-testable.
- The JSON format is versioned (`version: 1`). Changes must be additive, or bump the version and provide a migration.
- Progressions are independent drill files linked by `progression: { series, order }`.
- Prefer asking before adding dependencies or expanding scope beyond `PLAN.md`.
