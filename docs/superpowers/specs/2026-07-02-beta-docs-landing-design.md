# Beta docs + landing refresh — design

Date: 2026-07-02
Status: Draft (awaiting user review)
Owner: Omri

## Context

conciv hit its official beta: `@conciv/it@0.0.5` is published to npm under the `latest`
dist-tag (`npm view @conciv/it version` → `0.0.5`). The public surface is now complete —
the extension authoring API (`@conciv/extension`), the `@conciv/extension-testkit`, the
`conciv` CLI, and two built-in extensions (whiteboard, test-runner) that ship on by default
inside `@conciv/it`.

Two things are now out of date:

1. **The landing page lies about availability.** The install chip shows
   `npm i -D @conciv/it` struck through with a "Coming soon" badge
   (`apps/site/src/components/landing/install-chip.tsx`). The nav hides the GitHub link
   (`SHOW_GITHUB = false`) even though `github.com/conciv-dev/conciv` is public, and links to
   a `#how` anchor that does not exist on the page (`landing-page.tsx` renders only
   `SiteNav` + `Hero`).

2. **The docs predate the full API.** The docs site (`apps/site/content/docs`) covers the
   widget, quick-start per bundler, configuration, harnesses, test-runners, and
   troubleshooting — but has **no coverage of the extension API, the whiteboard, or the
   CLI**, which are the headline "full API" surfaces of the beta. The `index.mdx` still calls
   conciv "early".

The README (`README.md`) is further along than the site — it already documents extensions,
the whiteboard, and the package map — but still carries a stale
`conciv is early and not yet published to npm` note.

## Goals

- Landing page tells the truth: real install command, visible GitHub, working nav, a "Beta"
  signal.
- Docs are re-laid-out for a complete product: a real information architecture with a
  tutorial track, how-to guides, and reference — not a flat list.
- The extension API, whiteboard, and CLI are documented to the depth a first-time extension
  author needs.
- README's stale "not yet published" note is corrected (small, rides along).

## Non-goals

- No changes to the product/API itself. Docs-and-marketing only.
- No new npm `beta` dist-tag. "Beta" is product-maturity language; install stays
  `npm i -D @conciv/it` against `latest`.
- No rewrite of the existing, accurate quick-start/usage pages beyond "early"→"beta" wording.

## Assumptions (decided by best-judgment default; change freely on review)

1. **Delivery = three sequenced, independently-mergeable slices** (landing → docs IA → new
   content). The landing fix is urgent and small; it should not wait on the long-tail
   extension docs.
2. **Landing = full redesign** (decided 2026-07-02). Beyond beta-correctness, the landing gets:
   the live in-browser LLM hero demo (ported from the `worktree-spike-local-llm` spike),
   itshover animated icons (shadcn registry, Motion.dev), and a set of user-supplied shadcn
   components (features strip / how-it-works band / footer). Beta-correctness (real install,
   GitHub, working nav, Beta badge) folds into this redesign.
3. **Extensions docs = full track** (tutorial + per-area reference), because the user
   explicitly called out documenting the "full API".
4. **Whiteboard is documented as a shipped capability** (it is a default-on built-in in
   `@conciv/it`), placed under "Using conciv" with a pointer from the extensions section as a
   worked built-in reference.

## Slice 1 — Landing redesign

Full redesign of `apps/site/src/components/landing/*`. Three parts: beta-correctness,
the live LLM demo, and the visual expansion.

### 1a. Beta-correctness (baseline)

- **Install chip** (`install-chip.tsx`) — remove the strikethrough + "Coming soon" badge.
  Real, copyable `npm i -D @conciv/it` with a copy button; a compact "→ Quick start" link or
  one-line plugin snippet as secondary affordance.
- **Nav** (`site-nav.tsx`) — set `SHOW_GITHUB = true` (link already correct).
- **`#how` anchor** — becomes real: the redesign adds an on-page "How it works" band, so the
  nav link scrolls to it (`#how`) instead of dangling.
- **Beta badge** (`hero.tsx`) — extend the badge to include `Beta`.

### 1b. Live in-browser LLM demo (port from `worktree-spike-local-llm`)

The hero demo runs a real small LLM in a web worker (transformers.js / ONNX, WebGPU with
wasm fallback) that turns a grabbed element + typed instruction into a sanitized CSS patch,
applied live. Proves page-control on the marketing page with no backend.

- **Dependency**: add `@huggingface/transformers@^4.2.0` to `apps/site` (approved
  2026-07-02). Site-only, code-split into the worker, downloaded only on visitor intent.
- **Port**: `demo/models.ts`, `demo/local-model.ts`, `demo/model.worker.ts`,
  `demo/use-local-model.ts`, and the `demo/demo.tsx` + `demo/composer.tsx` integration
  (`runLocal` replaces the canned `buildTurn`). Drop the throwaway `routes/spike.tsx`.
- **Default model = SmolLM2 135M (~118MB)** (decided 2026-07-02) for the friendliest first
  load; keep the picker to upgrade to Qwen2.5-Coder 0.5B.
- **Guards**: load-on-intent only (never auto-download); client-only (no SSR execution of
  worker/transformers); Netlify header/CSP check (`connect-src` HF CDN, `wasm-unsafe-eval`,
  COOP/COEP only if multithreaded wasm is used — WebGPU path avoids it); graceful fallback to
  the canned transcript if the model fails to load or WebGPU/wasm is unavailable.

### 1c. Visual expansion (itshover + user shadcn components)

- **itshover animated icons** — shadcn registry (Motion.dev), added via
  `npx shadcn@latest add https://itshover.com/r/<name>.json` into the existing shadcn setup
  (`components.json`). Used across the features strip and how-it-works band.
- **User-supplied shadcn components** — cataloged as provided; each slotted into a section
  (features strip, how-it-works band `#how`, footer with docs / GitHub / npm links).
  Cataloged so far:
  - **KokonutUI SpotlightCards** → features strip (6 cards: Chat / Page control / Live tests /
    Extensions / Whiteboard / Approvals). Keep mechanics (magnetic 3D tilt, focus-dim
    siblings, 22px dot grid matching `.od-preview`); restyle skin to house tokens (single
    `--od-accent` red instead of six rainbow colors, `--od-panel`/`--od-line`, warm charcoal
    dark, drop shimmer sweep, itshover icons instead of lucide badges).
- **Motion dependency (decided 2026-07-02)**: add `motion` to `apps/site`, consumed ONLY via
  the lazy pattern — one `LazyMotion features={domAnimation} strict` provider around the
  landing sections, components import `m` (never `motion.*`; `strict` enforces), and
  `domAnimation` is dynamically imported to keep the engine out of the initial chunk.
  itshover registry copy-paste gets its `motion/react` imports rewritten to `m` on landing.
  GSAP stays the hero-demo timeline engine; motion drives components/icons — no per-element
  mixing.
- **Lenis smooth scroll (decided 2026-07-02)**: add `lenis` (~4kb, MIT) for the landing's
  scroll-driven feel, paired with GSAP ScrollTrigger for section reveals
  (`lenis.on('scroll', ScrollTrigger.update)` + gsap ticker raf). Constraints: mounted in the
  landing route ONLY (never `/docs/*` — fumadocs keeps native scroll); skipped entirely under
  `prefers-reduced-motion`; the demo transcript viewport gets `data-lenis-prevent`; the nav
  `#how` anchor scrolls via `lenis.scrollTo`.
- **React Bits set (decided 2026-07-02)**: registry `@react-bits` →
  `https://reactbits.dev/r/{name}.json` added to `components.json`. Locked picks (all deps
  already in stack, motion imports rewritten to lazy `m`): SplitText (section heading
  entrances, gsap), VariableProximity (one display heading; Bricolage variable wght),
  LogoLoop (bundler compatibility strip), ClickSpark (landing-wide ✦-echo click feedback),
  Magnet (CTA + GitHub buttons), AnimatedContent (standard scroll-reveal primitive).
  Try-and-judge at build time: DotGrid (#how band background, monochrome warm; cut if it
  fights) and Stepper (fallback if the custom #how band with itshover icons underdelivers).
  Rejected wholesale: WebGL shader backgrounds, glitch/neon/glass, cursor gimmicks (demo
  ghost cursor owns the cursor story), extra card/tilt variants, fake metrics.
- **Page order (locked)**: hero (existing, untouched) → LogoLoop bundler strip → features
  (SpotlightCards restyled) → how-it-works `#how` → footer (docs / GitHub / npm).
- **No emojis anywhere on the page (decided 2026-07-02)** — emoji markers read as AI slop.
  Bundler names are plain wordmarks (real SVG logos in the build), feature icons are
  itshover/stroke SVGs, UI glyphs are SVGs. Sole exception: the ✦ brand glyph.
- **Robot FAB shared port (decided 2026-07-02)**: the widget's rigged mascot
  (`packages/widget/src/shell/fab-robot.tsx` + 3 registered PNG layers + rig CSS) is the real
  product FAB and the landing must show it (how-it-works step 3, "Meet the robot"). Port:
  extract a framework-free GSAP rig core `createFabRobotRig(layers) → {apply(state),
destroy()}` exported as a `@conciv/widget/mascot` subpath (assets + CSS included); the
  Solid `FabRobot` and a new thin React wrapper in the site both delegate to it. No new
  package unless a third consumer appears.
- **Radiant shaders (decided 2026-07-02)**: footer-only, try-and-judge. One quiet
  organic/noise shader iframe behind the dark footer, params tinted to tokens, lazy-loaded
  below the fold, visibility-paused, static fallback under reduced-motion. Cut in the polish
  pass if it fights the voice. Everywhere else: rejected (glowing WebGL wash = slop tell).
- **Design mockup**: layout study artifact (hero unchanged / LogoLoop / SpotlightCards /
  sticky how-it-works with real robot rig / dark footer), motion-spec annotations inline:
  https://claude.ai/code/artifact/5f2afc6c-563e-4470-bd1a-fbfa9b81c6ea

Acceptance: no "coming soon"; copyable real install; GitHub visible; every nav link resolves
(incl. `#how`); Beta signal present; hero demo loads a model on intent and applies a real
patch (with canned fallback); landing builds and passes SSR without executing the worker
server-side. Verified in the built site.

## Slice 2 — Docs information architecture

File: `apps/site/content/docs/meta.json` (+ new folder `meta.json`s), plus front-matter/wording
touch-ups. Diátaxis-aligned grouping:

```
Getting started   → index (What is conciv) · quick-start/* · how-it-works
Using conciv      → usage/{chat, page-control, live-tests, approvals, quick-terminal, whiteboard*}
Extending conciv* → overview · your-first-extension · tool-contract · widget-ui · testing · built-ins
Reference         → configuration · harnesses · test-runners · cli* · packages* · troubleshooting
Examples          → examples
```

`*` = net-new page (built in slice 3). This slice creates the section groupings and moves
existing pages under them; it also updates `index.mdx` "early" language to "beta" and adds an
Extensions/Whiteboard/CLI card to the landing docs index and the usage index.

Fumadocs note: sidebar groups come from folder `meta.json` files. Confirm whether the current
flat `meta.json` should become folder-based sections or use separators; follow existing
fumadocs conventions in the repo.

Acceptance: sidebar renders the five groups in order; no dead links; existing pages still
resolve at their URLs (add redirects if any slug moves).

## Slice 3 — New API content

New pages (fumadocs MDX, matching the existing house style — see the
`docs-writing-style` memory: concise, example-first, no em dashes, fumadocs-ui components):

- **Extending conciv / overview** — the extension model: drop a `.tsx` into
  `conciv/extensions/`, auto-discovery, `defineExtension({name, tools})`, and how a tool
  becomes an agent-callable capability + card + optional composer UI. Note built-ins ship
  on by default.
- **Your first extension** (tutorial) — end-to-end: a `deploy_run` tool with
  `defineTool({name, description, inputSchema})`, `.server(...)` for the node action, and
  `.render(...)` for the result card; run it and see the card.
- **Tool contract** (reference) — `defineTool`: `inputSchema` (zod), `.server` execution,
  `.render` card, typing end-to-end. Exports from `@conciv/extension`
  (`defineExtension`, `defineTool`, types).
- **Widget UI** (reference/how-to) — client-side building blocks:
  `mountExtension`/`MountedExtension`, `useSlot`/`useContext`, composer actions, page
  inspect, `ensureEffectsSurface`/`openSource`. Note Solid JSX even inside a React host.
- **Testing extensions** (how-to) — `@conciv/extension-testkit`: mount an extension in a
  real browser against a real spawned server; second-client echo.
- **Built-ins** (reference) — whiteboard and test-runner as worked references, linking to
  their packages.
- **Using conciv / whiteboard** — the shared Excalidraw canvas: you sketch, the AI draws
  back real editable elements (mermaid included), source-anchored comments and pins.
- **Reference / cli** — the `conciv` CLI the agent calls from Bash:
  `tools server / page / test / open`, `ui`.
- **Reference / packages** (optional) — the package map (mirror the README table) so the
  site is self-contained; or link to the README.

Verify API specifics against source while writing (public exports live in
`packages/extension/src/index.ts` and `.../client.ts`; CLI in `packages/cli`). Every code
sample must typecheck against the published API.

Acceptance: a reader can go from zero to a working custom extension using only the site;
every code sample compiles against `@conciv/extension@0.0.5`; whiteboard and CLI each have a
page; the README "not yet published" note is removed.

## README rider (small)

Remove the `> conciv is early and not yet published to npm` NOTE block and the "not yet
published" clause; keep the quickstart. Optionally soften "Status: early" badge to "beta".

## Verification

- Landing: build the site, load it, click every nav link, copy the install command.
- Docs: build, walk the new sidebar, click through all new pages, confirm no 404s.
- Code samples: extract and typecheck against the published packages (or the workspace
  build).

## Open questions for review

- Landing depth: minimal fix (assumed) vs full expansion (features strip + how-it-works band
  - footer)?
- Package-manager tabs in the hero install chip: worth it, or is a single `npm` + copy enough?
- Fold `packages` into the site, or keep it README-only?
- Do the whiteboard/CLI belong under "Using conciv" and "Reference" respectively, or should
  they be nested inside "Extending conciv" as built-in examples?
