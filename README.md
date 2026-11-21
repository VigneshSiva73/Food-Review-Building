# Food Review Building - Sentra Testing

An interactive architectural visualization of office food quality. A dataset of daily
meal reviews is rendered as a triangular 3D tower where **each valid day is one floor**
and **each meal (Breakfast / Lunch / Dinner) is a structural pillar whose height is
driven by its average rating**. The building itself is the chart — no numbers are
printed on the geometry; they appear in the information panel on hover or selection.

## Stack

Vite 8 · React 19 · TypeScript (strict) · Three.js via React Three Fiber + drei ·
Zustand · PapaParse · Tailwind CSS 4 · Vitest

## Commands

```bash
npm run dev            # dev server
npm run build          # type-check + production build
npm run preview        # serve the production build
npm test               # unit + component tests
npm run test:watch     # tests in watch mode
npm run typecheck      # tsc only
npm run lint           # oxlint
npm run generate:data  # regenerate public/data/food-reviews.csv (deterministic)
```

## Architecture

Three strict boundaries, so correctness lives in code that is testable without a GPU:

```
CSV → data pipeline (pure TS, src/data) → layout solver (pure math, src/building)
    → R3F scene (src/scene) + UI dashboard (src/components), wired via Zustand (src/state)
```

- `src/data/` — `DataSource` abstraction plus the pipeline: parse → validate → dedupe →
  calendar rules → group → stats. No Three.js, no React.
- `src/building/` — pure geometry: footprint, rating→height, slab planes, facade,
  leave bands, explode transform, construction timeline. Emits plain numbers.
- `src/scene/` — thin GPU adapters over those builders. Instanced meshes, raycasting,
  camera, animation.
- `src/config/` — every tunable (heights, footprint, materials, lighting, camera,
  animation, breakpoints). No magic numbers in builders.
- `src/types/` — domain and layout models, deliberately Three.js-free.

### How the geometry works

Each day becomes a module of constant height. Three pillars rise from a flat deck ring
to heights normalized from their ratings (1 → 2.5 units, 5 → 6.5). A **tilted triangular
plate** rests exactly on the three pillar tops — three points always define one plane, so
the plate is mathematically exact rather than warped, and its slope leans toward the day's
weakest meal. A variable glass clerestory absorbs the height difference up to the next
flat deck, keeping the tower plumb over hundreds of floors.

Saturdays (no dinner) get a slender non-data steel post at the rear corner. Sundays and
third Saturdays produce no floor at all — a recessed dark service band marks the gap.

### Dataset

`public/data/food-reviews.csv` is the runtime source of truth: 04/06/2026 – 21/08/2026,
65 working days, 187 meal records, plus 8 exact and 2 conflicting duplicate rows that
exercise the cleaning layer. Regenerate it with `npm run generate:data`, or drop in a
real export with the same headers (`date, meal type, average rating, vendor name`) —
no code changes needed.

## Controls

| Input | Action |
|---|---|
| Drag / scroll | Orbit, zoom (one finger orbits, two fingers pinch-zoom and pan) |
| Hover | A compact summary follows the cursor |
| Click | Select a meal pillar, any part of a floor, or a leave band — the camera flies to it |
| `Esc` | Clear the selection |
| `R` | Reset the camera to frame the whole building |
| `F` | Re-frame the camera on the current selection |
| `↑` / `↓` | Step through floors (respects the day slider) |
| Month slider (bottom) | "All" shows the full tower; Jan–Dec shows that month as its own building, constructed floor-by-floor. Empty months show "No data". |
| Day slider (right, month view) | Bambu-style layer slider — show only floors up to that day of the month |

Toolbar buttons cover skip/replay of the intro, camera reset, auto-rotate, facade
detail, floor separation, and fullscreen.

## Debug flags

| Query string | Effect |
|---|---|
| `?days=N` | Deterministic synthetic dataset of N valid days (1–2000) for profiling |
| `?stats` | FPS/frame-time meter |
| `?demo=equal\|spread\|saturday` | Render a single fixture floor for joint inspection |

## Status

All 16 planned phases are complete.

- [x] Phase 1 — project setup, toolchain, config system, typed models, themed shell
- [x] Phase 2 — deterministic dataset generation
- [x] Phase 3 — data pipeline (parse → validate → dedupe → calendar → group → stats)
- [x] Phase 4 — base scene: lights/shadows, ground, orbit camera with dataset-agnostic auto-fit
- [x] Phase 5 — pure layout solver: footprint, rating→height, slab planes, leave bands, Saturday rule
- [x] Phase 6 — first floor rendered: instanced chamfered pillars, deck ring, tilted slab mesh
- [x] Phase 7 — full 65-floor tower with recessed leave bands
- [x] Phase 8 — realism: glass clerestory + mullions, fascia beams, capitals, podium, per-floor variation, procedural environment reflections
- [x] Phase 9 — performance: demand frameloop, frozen shadow maps, mobile quality tier, synthetic profiling
- [x] Phase 10 — interaction: hover/click, highlight overlays, metadata lookups, shortcuts
- [x] Phase 11 — dashboard UI: summary/selection/stats/issues/legend, viewport controls
- [x] Phase 12 — camera glide tweens (reset / re-fit / floor focus) and animated explode view
- [x] Phase 13 — construction animation: floors assemble bottom-up, skip/replay, reduced-motion aware
- [x] Phase 14 — responsive layouts (docked panel / slide-over / bottom sheet), touch, AA contrast, live regions
- [x] Phase 15 — error states: loading/error/empty overlays, WebGL fallback, error boundary, context-loss recovery
- [x] Phase 16 — coverage gaps closed, vendor chunk splitting, production build audit

**152 tests** cover the pure layers thoroughly (data pipeline 100%, building solver ~99%);
the scene layer is exercised visually, since it needs a real GPU context.

## Verified vs. needs a browser

<div id="welcome-message"></div>

<script>
  // Reads the 'name' parameter directly from the URL
  const urlParams = new URLSearchParams(window.location.search);
  const username = urlParams.get('name');

  // VULNERABLE: Inserts raw HTML directly into the DOM
  document.getElementById('welcome-message').innerHTML = "Welcome, " + username;
</script>


Automated here: dataset rules, pipeline cleaning, solver geometry and invariants,
selection metadata cross-checked against literal CSV rows, animation timeline bounds,
responsive breakpoints, WCAG AA contrast (computed from the real stylesheet), error
states, and a clean production build.

Still worth checking by hand, since this environment has no browser: sustained frame
rate while orbiting (`?days=300&stats`), a Lighthouse accessibility run, real-device
touch behaviour, and cross-browser rendering (Chrome/Edge/Firefox/Safari, iOS Safari).
