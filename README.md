# Hockey Drills

Draw hockey drills, animate them, and share them as links. A static web app: no server, no accounts, nothing uploaded.

**Live site:** https://sdobberstein.github.io/hockey-drills/

## What it does

- **Draw a drill** on a rink as one path per skater, in International Drill Symbols notation, and **link passes** by clicking where they leave and where they land. Pass speeds are worked out for you, and the editor shows where on a receiver's path a pass can land.
- **Animate it**, with a timeline that shows who is doing what and when, including any skater who stops and waits.
- **Work two ways** on the same drill: step by step, or as continuous paths.
- **Share it** as a link that carries the whole drill (nothing is stored anywhere), or download it as a JSON file.
- **Keep a library** of drills as files in [`drills/`](drills), with progressions (a drill and its variations).

Drafts autosave in your browser. A drill is plain JSON, described by [`schema/drill.schema.json`](schema/drill.schema.json).

## Run it locally

```sh
npm install
npm run dev      # the app, with hot reload
npm test         # the test suite
npm run build    # type-check and build to dist/
```

Needs Node 22 or later.

## Add a drill to the library

Draw it in the editor, choose **Download JSON**, and put the file in `drills/`, named after its id (`my-drill` becomes `drills/my-drill.json`). The tests check every file there against the schema.

## How it is built

TypeScript, React and Vite, with SVG for the rink. The design, the data model and the reasoning behind them are written down in [`PLAN.md`](PLAN.md); how we work on it (small conventional commits with commit messages and code comments that teach) is in [`AGENTS.md`](AGENTS.md).

## Deployment

Every push to `main` runs the checks, builds the site and publishes it to GitHub Pages (see `.github/workflows/deploy.yml`). Share links point at wherever the app is hosted, so they work for anyone who can open the site.
