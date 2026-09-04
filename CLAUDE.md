# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Verification

There is no CI and there are no git hooks. A check that is skipped is a check
that never happens, so run all four before calling a change done:

```
npx vitest run
npm run typecheck        # tsc -b
npm run lint             # oxlint
npm run build            # tsc -b && vite build
```

Do not treat the last two as formalities. `npm run lint` is oxlint with two
rules configured beyond the defaults, so it catches very little on its own —
`tsc -b` is the real gate. And `npm run build` typechecks the whole project,
including files that `tsc --noEmit -p tsconfig.app.json` leaves out.

Report the actual test counts and outcomes rather than saying it works.

## Architecture

The pure layers must not import three.js or React:

- `src/data/` — CSV pipeline (parse → validate → dedupe → calendar → group → stats)
- `src/building/` — layout solver for the hero tower (rating → pillar height, slab planes, facade)
- `src/city/` — zoning, blocks, traffic and pedestrian paths
- `src/terrain/` — island height field, rivers, roads, vegetation
- `src/air/` — aircraft paths

`src/scene/` is the only three.js layer, and it is a thin adapter over those.
This boundary is what keeps ~750 tests runnable with no GPU, and it is the
easiest rule to break by accident when adding a feature.

Every tunable number lives in `src/config/` as a frozen object. Builders read
from there — no magic numbers in geometry code.

Path alias `@/*` → `./src/*`, declared in both `tsconfig.app.json` and
`vite.config.ts`. Change them together.

## Rendering traps that no test catches

- The app runs `frameloop="demand"`. Anything animated must invalidate, or the
  frame never arrives and the scene sits frozen. There is exactly one frame
  loop: `src/scene/animation/AnimationDriver.tsx`.
- The shadow map is **frozen** and fitted to the tower (`ShadowFreeze.tsx`).
  Decorative meshes are deliberately `castShadow={false}`; adding a caster is a
  real regression.
- Never pass `raycast={undefined}`. R3F's `applyProps` skips undefined, so the
  prop can never be unset back to its default. Use `noopRaycast` from
  `src/scene/instancing.ts` to opt a mesh out of picking.
- Time-of-day values come from `applyBlend` and the registry, never from a React
  effect keyed to the hour. The registry holds exactly one sky rebuild.
- Module-scoped material and geometry caches have `dispose*` functions. Geometry
  built in a component must be disposed on unmount.

## TypeScript

`tsconfig.app.json` sets `erasableSyntaxOnly` (no enums, no parameter
properties, no namespaces — a TS enum fails the build), `verbatimModuleSyntax`
(type-only imports must say `import type`), plus `noUnusedLocals` and
`noUnusedParameters`.

## Tests

Co-located `*.test.ts(x)` beside the subject. Vitest is configured inside
`vite.config.ts`; the environment is `node` and there are **no setup files**, so
a component test must opt into jsdom with a first-line pragma:

```ts
// @vitest-environment jsdom
```

Without it the failures read as `document is not defined`.

`@testing-library/jest-dom` is installed but imported nowhere, so matchers like
`toBeInTheDocument` are unavailable. Assert with plain `expect` against
Testing Library queries.

`src/building/solver.test.ts` has a timing assertion that trips under full-suite
load and passes when run alone.

## Data

`public/data/food-reviews.csv` is **generated** — `npm run generate:data` is
fully seeded and rewrites it identically every run, silently discarding hand
edits. Change the generator in `scripts/`, not the CSV.

The last three columns (`people count`, `consumed`, `reviewed`) are optional by
design: a file predating them is valid, but a present-and-wrong value is an
error. The funnel invariant is `reviewed ≤ consumed ≤ count`.

## Debug query params

`?hour=<float>` (time of day), `?days=N` (synthetic dataset for profiling),
`?stats` (FPS meter), `?demo=equal|spread|saturday` (single fixture floor).

## Visual work

Change one visible thing, show it, and wait for a reaction before layering the
next change on top. Build the part that makes the work visible first — if a
change is only visible under a new view or mode, ship that view with the first
increment. Commit each verified step on its own so an undo is one command.

The capture harness lives in `.shots/` (`./.shots/run.sh out.png "?hour=10"`).
Two caveats: it is **gitignored**, so it is not in a fresh clone and cannot be
assumed present; and it cannot capture the side-panel 3D previews, because two
WebGL contexts under software GL time out.

Screenshots need the explicit frame pump the harness already does — headless
Chrome starves rAF and the app only renders on demand, so an unpumped frame is
not evidence. `.shots/wall.py` measures hardcoded pixel crops of a 1600×1000
frame; move the camera and those boxes silently measure the wrong thing.

## Conventions

Comments here carry the reasoning, not the mechanics: why a choice was made, and
often what was tried and rejected. Match that register in new code.

Commit subjects are sentence case, no `feat:`/`fix:` prefixes, no scope tags, no
trailing period — plain English describing the result, either a verb phrase
("Take the bubbles off the sea") or the new state ("A wind sea, not four
sines").

Branches and tags are lowercase kebab-case; exploratory work goes on
`<feature>-attempt` branches, and rejected directions are kept on their branch
or tag rather than deleted. Default branch is `master`; the repo is local-only,
with no remote.

## The README is stale

It describes a standalone tower with 152 tests and a 187-row dataset. The
project now includes a procedurally generated island, a city, a sky and a
time-of-day system, with ~750 tests across 82 files, and the CSV starts at
2025-01-01 with three more columns. Do not trust it for scope, counts or the
dataset's shape.
