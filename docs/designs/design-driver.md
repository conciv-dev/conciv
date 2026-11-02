# Design driver: from "build this page from this image" to a matching page

- **Author:** Omri Katz (omridevk)
- **Status:** Proposed (sixth revision; rulings 1 to 22, four EGM review rounds and the as-built notes through step 6 folded in)
- **Date:** 2026-11-02

---

## Terms

| Term           | Meaning in this document                                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| conciv         | The in-browser developer widget this repository ships, plus the server process it talks to. "The widget" is the script in the page.                                                          |
| server process | The conciv server where the design extension's `server/` code runs, stores targets and serves the MCP tools. It renders nothing.                                                             |
| app tab        | The browser tab where the user's app runs with the widget. Every measurement is taken here.                                                                                                  |
| session        | The conciv session id the widget and the MCP client share (`CONCIV_SESSION_HEADER`). It selects the current target and the tabs a run may ask.                                               |
| x-ray          | The design extension's inspection UI. Today a separate document; in this design an overlay pane inside the app tab.                                                                          |
| target         | One design image registered with `design_target`, plus everything read from it.                                                                                                              |
| design width   | The width of the target image in CSS pixels after the scale is applied.                                                                                                                      |
| live width     | The width of the app tab's viewport.                                                                                                                                                         |
| mirror         | A scriptless, same-origin iframe in the app tab holding a snapshot of the live DOM, rebuilt at every run and laid out at the design width (ruling 21).                                       |
| design slice   | The nodes read from one target image. One slice per registered image.                                                                                                                        |
| node           | A design-side item read from the image: a text node (one or more OCR lines on one line), a box or an image.                                                                                  |
| OCR line       | One line of text the OCR reader returns, with its box and confidence.                                                                                                                        |
| component      | A live-side rendered element with its provenance (`data-conciv-source`). "React component" is written out when the source-level unit is meant.                                               |
| pair           | One node linked to one component for this run.                                                                                                                                               |
| twin           | One node linked to a node of another slice (another design width).                                                                                                                           |
| run            | One measurement pass producing one stored report.                                                                                                                                            |
| round          | A run that `design_diff` observed. Budget, stall and oscillation count rounds.                                                                                                               |
| item           | One row of a report: a delta of one kind on one node, or an `unbuilt`, `extra` or `offset` entry. Keyed by node id plus kind.                                                                |
| stage          | One of structure, content, geometry, paint; the stage of a run is the first with a count above zero.                                                                                         |
| brief          | The first `briefSize` items of the current stage, as fix sentences, plus one line per warning.                                                                                               |
| stop           | The reason the loop ends: `done`, `residual-only`, `stalled`, `oscillating`, `budget`, or `null`.                                                                                            |
| decision       | A persisted user choice applied every run: `pin`, `excluded`, `image-slot`, `accept-delta`, `tolerance`. Accepting a run is `acceptedRun` on the target record.                              |
| source         | The geometry provider that measured a value: `dom` (live tab), `mirror`, or `takumi`.                                                                                                        |
| capture path   | How this run's pixels were taken: `region` (Region Capture of the live page), `snapdom-live`, or `snapdom-mirror`.                                                                           |
| carry          | Drawing a node's box on the live tab when the tab width differs from the design width: design box plus (live component box at the tab width minus mirror component box at the design width). |
| residual       | Pixels that differ after every pair's deltas and every decision are masked.                                                                                                                  |
| slot           | One function type in `shared/types.ts` with a registry of implementations selected by `designConfig`.                                                                                        |
| ruling         | A decision Omri made on 2026-11-01 or 2026-11-02; the list is `docs/designs/design-driver-rulings.md`.                                                                                       |
| Jev            | TypeSafe's small judgment model, a candidate later implementation for two slots. Not used in this change.                                                                                    |
| EGM            | The review method used for this document (`egm-review/driver*/`).                                                                                                                            |

External tools: snapdom (`@zumer/snapdom`, DOM to PNG in the browser), ppu (`ppu-paddle-ocr`, `ppu-ocv`: PaddleOCR and OpenCV on wasm, Node), blazediff (pixel diff), rrweb-snapshot (DOM serializer), Region Capture (`CropTarget`, Chromium screen capture cropped to an element), takumi (`takumi-paint`, a CSS layout engine on wasm).

## Overview

A developer in a coding agent hands over a PNG and says "build this page from this image" or "make this page match this image". The design extension can already compare a live page with an image: `design_target` registers the image, `design_diff` reports measured differences with source locations, `design_status` says whether the page is clean, and the x-ray shows it all. Pull request #683 made text compare as text. What is missing is the loop around those tools: the agent is not told that a target exists, what to fix first, when to stop, or what finished means. On 2026-11-01 a Sonnet run with a registered target never called `design_diff`; it took screenshots and built the page by eye.

The driver closes that gap under one rule (rulings 1 and 18): everything runs in the user's app tab from the widget script, with the server process doing the work on data it already holds (ruling 20). No browser is launched, no DevTools Protocol, no extension. Width is a fact of the image (ruling 2). When the tab width differs from the design width, the mirror lays a snapshot of the live DOM out at the design width and every measurement, pixels included, is taken there (rulings 14, 16, 21). Pairing is a calibrated vote over independent signals (ruling 17), recomputed every run; only decisions persist. Rounds count on `design_diff` (ruling 15); saves refresh pixels (ruling 7).

## The Problem

1. **No driver.** The agent guide carries one design bullet (`packages/harness-init/src/agent-guide.ts`) that tells the agent to pass a route and a width and to run `diff`. Nothing in the agent's context says a target is registered; nothing orders the fixes; nothing says when to stop.
2. **The target is too thin to drive fixes.** Against a PNG the only deltas that fire are `text`, `background`, `foreground`, geometry and unmatched regions. Typography, radius and borders need a number on the target side. Designs carry sample data ("Acme Corp", "$1,200") where the page renders expressions; a text delta on `{invoice.total}` leads the agent to hard-code the sample.
3. **Width is bound to the tab.** A target is keyed by route and width, `design_diff` takes a width, and a hidden iframe renders the app a second time at that width (`client/capture.ts`, `frameAtRoute`). The loop spike (branch `design-loop-spike`) showed that iframe stalling for minutes when the tab was covered, because its settle waits on `requestAnimationFrame`.
4. **Pixels are stale between diffs.** A geometry-only run cannot tell whether paint still differs, so the x-ray shows "off" rows from an old capture.
5. **Missing measurements.** Table row borders showed as "the paint differs, but no property delta was measured" because `border` is not a delta kind.
6. **Pairing is too strict to drive a loop.** A text component pairs only with a node of equal text, so "Create" against "Create invoice" yields an extra plus a missing node and no `text` delta, and an expression cell rendering "$980" against "$1,200" becomes a "create this" item.
7. **Several widths are unrelated.** A design arrives as several images at several widths. Nothing relates a node at 1280 to the same node at 390, so nothing can say what disappears, reorders or stretches between them, and an empty page has no responsive specification to build from.

## Goals

- A user sentence with an image reaches `stop: done` with no setup beyond conciv running in the app. The agent's context states that a target exists and what to call (Problem 1).
- `design_target` takes an image and an optional scale. Width and height come from the PNG header. Route is a label. `design_diff` and `design_status` act on the session's current target (Problem 3).
- The app is rendered once, in the app tab (Problem 3).
- Every run captures pixels, on the capture path of section 3; two runs are compared only on the same path (Problem 4).
- When widths differ, every measured property comes from the mirror at the design width (ruling 16). Each measurement carries its source and a confidence. A takumi second opinion, when available, is shown in the overlay and never scored (Problem 3).
- Nodes and components are paired by a calibrated vote (ruling 17) with per-kind exclusion and abstention (Problem 6).
- Slices are paired with each other as twins (ruling 19); twins are a voter and the responsive section of the report (Problem 7).
- Alignment is hierarchical and rows are ordered top-down by containment, so one fix at the top clears the rows under it (Problem 1, ruling 6).
- Rounds, budget, stall and oscillation count only runs observed by `design_diff` (ruling 15).
- The target is a flat list of nodes read from the image; the live DOM is the only tree (Problem 2).
- Decisions (pin, excluded, image slot, accept a delta, tolerance) and acceptance of a run are made in the overlay, persist, and apply every run (Problem 2).
- Text roles from rules; a live `expression` never yields a `text` delta; a live literal equal to a target `data` cell is a warning (Problem 2).
- Every report carries stage, brief, round, budget left, stop and the score tuple (Problem 1).
- `border`, `axis` and `columns` join the delta kinds; `fill` leaves (Problem 5).
- Three trials under `docs/designs/trials/` each end `done` or `residual-only` within the budget before the branch is called ready.

## Non-Goals

- Any launched browser, DevTools Protocol or browser extension.
- Rendering the app a second time. The mirror is a scriptless snapshot.
- A hierarchy inferred from the image. `within` is a pairing hint.
- Route resolution from the image.
- Undo, redo, replay, an event log or edit capture.
- A decision engine calling out of the machine. Rules now; Jev later behind the same slots.
- Persistent automatic pairs. The one stored pair that is read is another target's latest run, for the twin voter.
- The Figma adapter (`TargetAdapter` exists for it).
- Width and height as delta kinds or fix targets.
- A residual stage the agent works on.
- Breakpoint inference from one image; predicted heat-map columns between design widths.
- The no-target breakpoint sweep (ruling 10, Future Improvements).
- SQLite.
- Learned weights (Future Improvements).

## Critical User Journeys

### CUJ 1: Match the open page to an image

- **Given**: The app runs with conciv; the user is on `/invoices` at any tab width; `invoices.png` is a 1x export of a 1280-wide design.
- **When**: The user says "make this page match invoices.png". The agent calls `design_target` with the image. The server reads width and height from the PNG, reads OCR lines and boxes, stores the target as the session's current one, runs run 0 and returns the stage, the brief and the guide line. The agent edits; each save settles and a run refreshes the overlay; the agent calls `design_diff` to read a round.
- **Then**: Each report carries stage, brief, round, budget left and stop. Rows name an intrinsic property, never a width or height. The overlay shows rows live with source and confidence, and this run's pixels.

### CUJ 2: Build a new page from an image

- **Given**: The user created a route that renders nothing yet and is on it.
- **When**: "Build this page from this image." Every node is unpaired; the brief lists the largest top-level boxes and texts to create.
- **Then**: As components appear they pair; nodes inside a paired container that are still unpaired stay structure items until built.

### CUJ 3: Tab width differs from the design width

- **Given**: The design is 1280 wide; the tab is 1392 wide (or 390).
- **When**: A run happens.
- **Then**: The mirror is rebuilt from a snapshot and laid out at 1280. Rects, computed styles and pixels (snapdom of the mirror) are read there; every row says `source: mirror`, `capturePath: snapdom-mirror`. The overlay draws each row's box on the tab by carry. The agent is never asked to resize the tab.

### CUJ 4: Dynamic content and marks

- **Given**: The design's table shows "Acme Corp", "$1,200" and "[Customer Name]"; the page renders those cells from expressions.
- **When**: Rules mark the bracketed cell `placeholder` and the currency `data`; "Acme Corp" is `unknown`. The live side reads `expression`. The user marks the avatar column as an image slot and raises the color tolerance on the chart card.
- **Then**: The cells pair (geometry, structure and kind vote when text disagrees) and no `text` delta fires. The marks apply every run and survive re-registration of the same image. A cell hard-coded as `"$1,200"` yields a warning line in the brief ("replace the hard-coded sample with the expression") and no count.

### CUJ 5: Accept the residual

- **Given**: After six rounds only a chart the app renders differently remains above the tile gate.
- **When**: The loop stops `residual-only`. The user accepts the run from the overlay.
- **Then**: `design_status` is done while the score is not lexicographically worse than the accepted run's, on the same capture path.

### CUJ 6: Two design widths

- **Given**: The user registers `invoices-390.png`, then `invoices-1280.png`, so 1280 is current.
- **When**: The agent calls `design_diff`.
- **Then**: The report carries the 1280 slice's items and a responsive section from the twins: nodes present at 1280 and absent at 390, nodes whose order changes, nodes whose width reaches the slice width in one and not the other. Calling `design_target` again with the 390 image makes it current and the loop continues there.

## Verified assumptions

Checked in the source on 2026-11-01 and 2026-11-02 (review rounds 3 and 4). Paths under `packages/` unless stated.

- Slot types in `extensions/design/src/shared/types.ts`: `TargetAdapter`, `Enricher`, `TextReader`, `PixelComparator`, `GeometryEstimator`, `ColorMetric`, `Matcher`, `DeltaKind`, `ProvenanceMapper`, `TargetStore`; `REGISTRIES` and `pickRuntime` in `server/registries.ts:15,28`. `Matcher` and `GeometryEstimator` are deleted here; `expand` from `server/matchers/` is imported by `text-groups.ts:6`, `unmatched.ts:3` and `tool/steps/diff.ts:28` and moves to `raster.ts`.
- `Pair` (`types.ts:103`) carries selector, mismatch, depth, parent, prev, next. `Unmatched` is `missing | extra` (`types.ts:140`, `defs.ts:86-91`, `xray/data.ts:22`); `missing` becomes `unbuilt`. `breakpoint` (`types.ts:137`, `defs.ts:83`) becomes `width`. `fill` is in `DELTA_KIND_NAMES` (`defs.ts:22`) and measures a width ratio (`deltas/fill-align.ts`); it is deleted with test 345.
- `shared/above.ts` `aboveTolerance` counts every unmatched entry and drives `status.done` (`status.ts:41`); per-component `mismatch` (`defs.ts:126`) comes from the tile matcher.
- `raster.ts` holds `medianColor`, `boxMask`, `paintOver`, `findRegions`, `crop`, `edgeMap`; `sampledFills` and `glyphCoreColor` are in `server/deltas/colors.ts`; `trimToInk` and `differs` are in `server/comparators/paddle.ts:175-207`, exported as `./paddle` (`package.json`), imported by `text-groups.ts:4` and the IT (line 42). There is no `./raster` export.
- `record.json` holds `id`, `route` (required string, `store.ts:19`), `width`, `height`, `name`, `scale`, `createdAt`; `session` and `acceptedRun` are new and `route` becomes optional.
- The diff image already applies the agreeing-text mask (`tool/steps/diff.ts:228-294`).
- The whiteboard mounts its Solid overlay through `Surface` of `defineExtension` (`whiteboard/src/client.tsx:39-49`). The design client is `client.ts`; `solid-js`, `@tanstack/solid-router`, `@conciv/ui-kit-system` and `@unocss/reset` are devDependencies; `vite.config.ts:7` names `src/client.ts` as entry with no Solid plugin.
- `ServerApi` (`extension/src/types.ts:100-110`) has no page access; `ServerToolPageAccess` is built per tool call (`extension/src/tool-registry.ts:356-367`); the page bus delivers an `ask` to every widget subscribed to the session and takes the first reply, default timeout 5 s (`core/src/page-bus.ts:99-119`); client tools are listed in the agent catalog (`tool-registry.ts:351-353`). `SystemPromptResolver` receives `{cwd}` only (`extension/src/types.ts:122-126`). The `__client` factory takes no arguments (`define-extension.ts:64`).
- The page extension's `hmr.ts:43-72` is pull-only; the settle handshake exists only on `design-loop-spike` (`0579e1809`).
- `rrweb-snapshot` 2.2.0 is in the catalog (`pnpm-workspace.yaml:132`); `rebuildIntoSandboxedIframe`, `neutralizeSubtree` and `isDangerousTag` are exported from `@conciv/protocol/element-capture-sanitize`, which the design extension already depends on. `collectCssText` (`page/src/css-bundle.ts:12`) and `scrubSensitiveValues` (`page/src/element-capture.ts:94`) are module-private; `@conciv/page` exports only `.`. `client/components.ts:174` `collectComponents({root})` reads boxes, styles, glyph line rects and axis from any document; `client/capture.ts:80,98` call it on the frame and the live document; `readStyles` (`components.ts:38-49`) has no border.
- `paddle.ts` is Node-only; `blazediff.ts:3` loads `pngjs` through `raster.ts`. Both stay in the server process (ruling 20).
- `data-conciv-source` is absent on `node_modules` components (`vite-plumbing.ts:92`) and on `innerHTML` content (IT 1086).
- Fixtures (`it/test/fixtures/design/`): shots `u1-1280`, `u1-390`, `plain-1280`, `u1-1280-firefox`, `u1-2560` (`render-targets.ts`; `plain-1280` renders `/plain.html`, the rest the `target` variant); the `badge` variant paints a background-image strip (`Toolbar.tsx:32-37`) and diffs with `deltas: []`; cards are a flex row (`card.module.css:1-4`); the row border is `styles.css:79`; `Toolbar.tsx:7` renders `{props.label ?? 'Export'}`; `Table.tsx:13-20` has literal cells `INV-001`, `INV-002`, `1,200`, `860` and an `Acme` row.
- `skillFile()` (`harness-init/src/claude/plugin-files.ts:67-79`) renders the generic `conciv` skill; `check:refs` fails a SKILL.md without `## Sources`; the tree file is `skills/skills/_artifacts/skill_tree.yaml`.
- Tests outside the IT touching these tools: `cli/test/cli.test.ts:249-252, 314-326, 360-361`; `harness-init/test/harness-init.test.ts:612`.

## Spikes

Records stay outside the repository (spike code is not shipped; the measured conclusions are summarised here and in `docs/designs/design-driver-rulings.md`), except the OCR spike in `docs/superpowers/specs/2026-11-01-design-text-layer-spike.md`. Every image measured was a browser render on macOS.

- **OCR**: PaddleOCR through ppu, shipped in #683; 0.4 to 0.9 s per page in the text-layer spike. Tall pages are read in overlapping tiles; tiles whose glyphs are under 16 px tall are upsampled 2x first; lines under a confidence floor are dropped (at 400 px wide, lines such as `wgnnrtc.` caused the only wrong twins).
- **Segmentation**: thresholding against the parent background finds every fixture container within 2 px with no spurious box, 33 to 76 ms; on real pages level 1 and 2 containers at 50% and 57% (conciv.dev), 14% and 0% (Stripe), 64% and 33% (the Guardian), 0 to 3 spurious boxes and up to 8 spurious image leaves, 357 to 1164 ms. A box source, not a structure source.
- **Typography**: render search within 0.5 px in 210 of 210 cross-renderer cases; no ink ratio within 1 px (misses up to 9.6 px). Weight by coverage over a 400 render: bold at 1.2 or more, regular at 1.07 or less. Rasterized with Playwright; the browser rasterizer (snapdom) is unmeasured (Risks).
- **Layout engine**: takumi 2.19 via `takumi-paint` 0.5. Fixture 0 px; reference dashboard p95 1.7 px at 1280, 7.4 px at 390; conciv.dev 97% matched, p95 25 px after `clamp()` pre-resolution. Unsupported: `clamp`/`min`/`max` with `%`, `em`, `var()`, container queries, `opsz`. Fonts as bytes (the spike read system fonts from disk, which a page script cannot). 1.5 to 81 ms; wasm 6.8 MiB.
- **Mirror carry** (`spikes/pairing/interp-spike`, ruling 14): conciv.dev screenshots at 400, 780, 1280 as designs; a node's box at W predicted by carry matched OCR of the real screenshot at W with p95 0 to 9 px at 440, 900, 1400.
- **Pairing** (`spikes/pairing/pair-spike`, ruling 17): the vote of section 3, same code on every page. Right, wrong, ambiguous, abstained; rows sum to the node count.

  | page                | stage                    | nodes | right | wrong | ambiguous | abstained |
  | ------------------- | ------------------------ | ----- | ----- | ----- | --------- | --------- |
  | reference dashboard | finished                 | 136   | 136   | 0     | 0         | 0         |
  | reference dashboard | placeholder copy         | 136   | 136   | 0     | 0         | 0         |
  | reference dashboard | all-block layout         | 136   | 88    | 2     | 17        | 29        |
  | reference dashboard | bigger fonts and padding | 136   | 97    | 2     | 11        | 26        |
  | reference dashboard | empty page               | 136   | 3     | 0     | 0         | 133       |
  | stripe.com          | finished                 | 399   | 349   | 5     | 27        | 18        |
  | stripe.com          | placeholder copy         | 399   | 196   | 21    | 34        | 148       |
  | MDN `flex`          | finished                 | 621   | 567   | 3     | 12        | 39        |
  | MDN `flex`          | placeholder copy         | 621   | 532   | 4     | 17        | 68        |

  Wrong share on finished real pages: Stripe 1.25% (3 of the 5 are truth errors, logos read as words), MDN 0.5%. Timing in the Node spike: Stripe about 3 min for 427 nodes against 1549 elements, MDN 50 s for 645 against 6242; the product pairer's cost is unmeasured (Risks). The spike's accessibility voter used the DevTools Protocol tree; the product uses tag, `role` and `aria-*`.

- **Twins** (`spikes/pairing/pair-design.ts`, `pair-site.ts`, ruling 19): conciv.dev slices, truth the same DOM element at both widths: 1280 to 780 64 of 66 twins, 0 wrong; 780 to 1280 65 of 70, 0 wrong; 400 to 780 47 of 56, 0 wrong. The twin voter changes nothing on a finished layout (50/5 and 52/6 with and without), helps on a shifted layout with real copy (38/13 to 42/10), hurts when copy and layout both differ (23/26 to 20/26). It stays, weighted by the twin's confidence, never primary.

## Technical Plan

Everything lives in `packages/extensions/design` unless stated. Two processes: the server process (`server.ts`, `server/`) and the app tab (`client.tsx`, `client/`, the x-ray under `xray/`). Measurement is owned by the always-loaded client (`client.tsx`); the x-ray is UI. The module structure is `docs/designs/design-extension-structure.md`: one file per slot holding every implementation as a private function and exporting one table; about 20 files in all. Where this document names a file per implementation, read it as a private function in the slot file named in the tree below.

```text
src/
  client.tsx           widget entry: measurer, mirror, capture, type renders, CSS winner, the composer button and the pane Surface
  client/takumi.ts     the takumi second opinion (step 6)
  server.ts            extension entry: pickRuntime over the slot tables, CSS map, x-ray routes, dispose
  shared/              defs.ts (tool defs, wire schemas), types.ts (domain types, slot interfaces), tolerances.ts (constants, designConfig, stage and tolerance tables)
  server/              target.ts (ADAPTERS, TEXT_READERS, ENRICHERS, SEGMENTERS, ROLE_RULES, registration), deltas.ts (DELTA_KINDS, COLOR_METRICS, sideFrom),
                       provenance.ts (MAPPERS), raster.ts, store.ts, pair.ts (PAIRERS, RANKERS, pair tree, alignment, pairTwins),
                       loop.ts (items, stages, score, brief, stop, runs, HMR settle), differ.ts (PIXEL_COMPARATORS, the run, tool bindings), xray-routes.ts
  xray/                entry.tsx, router.tsx (routes, data, the in-tab pane), panel.tsx, decisions.tsx (run bar, pins, marks, accept, capture), heatmap.tsx, stage.tsx, states.tsx
```

```text
 app tab                                                    server process
 ┌──────────────────────────────────────────────────────┐   ┌─────────────────────────────────┐
 │ live page (rendered once)                             │   │ design_target: image, width from │
 │   client.ts: measurer, scratch iframe, mirror         │   │   PNG, OCR, segment, roles,      │
 │   collectComponents on document or mirror document    │◄─►│   twins, current per session     │
 │   capture: region | snapdom-live | snapdom-mirror     │   │ run: pair, estimate, align,      │
 │   overlay (x-ray): rows, pins, marks, accept, capture │   │   deltas, decisions, stage, stop │
 └──────────────────────────────────────────────────────┘   └─────────────────────────────────┘
          ▲ hmr settle (ported handshake)                  page.ask ▲        ▲ design_diff / status
      agent edits ──────────────────────────────────────────────────┴── agent reads the round
```

### 1. Slots and composition

A slot exists where this document names a second implementation, present or future.

| Piece         | Contract                                                               | Default (private function)          | Second                   | Table               |
| ------------- | ---------------------------------------------------------------------- | ----------------------------------- | ------------------------ | ------------------- |
| Image loading | `TargetAdapter` (exists)                                               | image, in `server/target.ts`        | Figma adapter (future)   | `ADAPTERS`          |
| Target text   | `TextReader` (exists)                                                  | paddle, in `server/target.ts`       | existing table           | `TEXT_READERS`      |
| Enrichment    | `Enricher` (exists, contract changes)                                  | text, segment, roles, color         | existing table           | `ENRICHERS`         |
| Target boxes  | `Segmenter: ({raster, nodes}) => Promise<TargetNode[]>`                | threshold, in `server/target.ts`    | edge segmenter (future)  | `SEGMENTERS`        |
| Text roles    | `RoleRules: ({text, neighbours}) => {role, confidence}`                | rules, in `server/target.ts`        | Jev (future)             | `ROLE_RULES`        |
| Pairing       | `Pairer: ({components, nodes, twinVotes, pins, tolerances}) => Pair[]` | vote, in `server/pair.ts`           | learned weights (future) | `PAIRERS`           |
| Ranking       | `Ranker: ({items}) => items`                                           | impact, in `server/pair.ts`         | Jev (future)             | `RANKERS`           |
| Pixel compare | `PixelComparator` (exists)                                             | blazediff, in `server/differ.ts`    | existing table           | `PIXEL_COMPARATORS` |
| Delta kinds   | `DeltaKind` (exists)                                                   | one per kind, in `server/deltas.ts` | existing table           | `DELTA_KINDS`       |
| Provenance    | `ProvenanceMapper` (exists)                                            | in `server/provenance.ts`           | existing table           | `MAPPERS`           |
| Color         | `ColorMetric` (exists)                                                 | in `server/deltas.ts`               | existing table           | `COLOR_METRICS`     |

Plain functions: alignment and `pairTwins` (`server/pair.ts`), the type estimate (`client.tsx` renders, `server/target.ts` trims and bisects), the loop policy, round history and the run queue (`server/loop.ts`), the store (`server/store.ts`, typed by `TargetStore`), the measurer, capture and the mirror (`client.tsx`). `Matcher`, `GeometryEstimator`, the tile matcher, the edge projection, the `geometry` and `matcher` config enums and `Comparators.geometry` are deleted; the tile comparator's windowed search stays inside the pixel comparator for the residual.

**Composition.** `pickRuntime` (exists) builds `DesignRuntime` from `designConfig`. `createDiffer({runtime, store, page})` (`server/differ.ts`) returns `{register, run, status}`, the only object the tools and the x-ray routes call. `page` is the new `ServerApi.page.ask({sessionId, name, input, timeout})` (core change in `packages/extension` and `packages/core`): it delivers a client tool call to the widgets of a session outside any tool step. The design client registers `design_measure` (`shared/measure.ts` schemas) with `catalog: false`, so the agent never sees it; the differ calls it with `record.session` and `measureTimeoutMs` 60000. Any tab of the session answers; the reply carries the tab's route, and when it differs from the target's recorded route the run is refused with a `route` item instead of a diff. An `hmr-update` carries no session, so it runs the current target of every session that has a subscribed widget. `createMeasurer()` (`client/measurer.ts`) is created once by `client.ts` and owns the mirror, the scratch iframe and capture.

### 2. The target

`design_target` takes `{image, scale?, route?, name?}`. Width and height come from the PNG header divided by `scale` (default 1). `route` and `name` are labels; `route` defaults to the tab's route when a widget is subscribed, for the route check above. The target is stored under a content hash of the image bytes and becomes the session's current target. Registering an image whose hash the session already holds keeps the id and the decisions and makes it current again. `design_diff` and `design_status` resolve `store.current({session})`: the newest target registered by this session, else the only target, else the report "no design target is registered; register the design image with design_target". `assertLiveRoute` goes.

The target model is a root plus a flat list of nodes:

| Node kind | Fields                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| all       | `id` (hash of kind, rounded box, text), `kind`, `box`, `within?` (smallest containing box node, a pairing hint)                             |
| `text`    | `text`, `lines` (OCR lines), `confidence`, `role`, `roleConfidence`, `typography?: {size, lineHeight, weight, confidence}` (filled by runs) |
| `box`     | `paint.background`, `border`, `radius`                                                                                                      |
| `image`   | nothing more                                                                                                                                |

`TargetNode` loses `children` on everything but the root; `kind` is retyped from today's `frame | text | image | vector | component | unknown`. Enrichers run at registration in the server process, in order, each only on nodes missing its field; the contract becomes `Enricher.run({model, raster, runtime}) => Promise<TargetNode[]>`:

1. **Text** (`server/enrichers/text.ts`): tiled OCR through `runtime.text`; upsample tiles with glyphs under `ocrUpsampleBelowPx` 16; drop lines under `ocrConfidenceFloor` 0.6; join lines on one row (vertical overlap over half the smaller height, horizontal gap under one line height) into one `text` node. Replaces `readText` in `target.ts`; the OCR failure path becomes `TargetResult.text: 'failed'` as today.
2. **Segment** (`server/enrichers/segment.ts`): `runtime.segmenters`. The default ports the spike's threshold variant with `boxMask`, `paintOver`, `findRegions`, `edgeMap` (raster) and `sampledFills`, `glyphCoreColor` (colors): text boxes masked grown by `glyphHalo`, threshold at `segmentDistance` 10 against the parent background, external contours, minimum side `unmatchedMinimum`, a `box` when the interior inset by `interiorInset` is at least half uniform or a border steps on all four sides, else an `image`. When depth-1 image leaves cover more than `segmentImageShare` 0.3 of the page the report says `segmentation: partial`.
3. **Roles** (`server/enrichers/roles.ts`): `runtime.roles`. Default: brackets or braces around the whole string, lorem ipsum, and shape tests by code-point class (currency, date, percentage, integer, identifier) give `placeholder` or `data` with confidence 1; else `unknown`. The live side reads `literal`, `expression` or `mixed` from the JSX at the provenance site (`server/roles/live.ts`).
4. **Color** (exists).

**Twins** (`server/twins.ts`, ruling 19): after enrichment, the new slice is paired with every other slice of the session by `pairTwins({a, b, tolerances})`, the voters of section 3 minus geometry, stored as `twins.json` on both targets.

### 3. Runs

`server/runs.ts`: one run in flight and at most one pending per target; a newer trigger replaces the pending one; `design_diff` awaits the newest. Triggers: registration (run 0); a settled hot-module update (the page client posts its `vite:afterUpdate` timestamp to the page extension's server, which forwards it over the bundler bridge; debounced `runDebounceMs` 150); `design_diff`; a decision from the overlay. A run has a ceiling of `runBudgetMs` 20000, after which it reports `partial`.

| Step             | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Measure        | `design_measure` returns components (boxes, computed styles including border, glyph line rects, `columns` from `grid-template-columns`, live role, shadow roots walked with an `s` path segment) from the live document when widths match, else from the mirror; plus the pixels and the capture path.                                                                                                                                                                                                                                                                                     |
| 2 Mirror         | When widths differ: `rrweb-snapshot` of the live document with `blockSelector` for the widget root, iframes, video, audio, object and embed, rebuilt with `rebuildIntoSandboxedIframe` into a `sandbox="allow-same-origin"` iframe sized to the design width and the live `innerHeight`, positioned off-screen but rendered. Fonts: the snapshot inlines stylesheets; `fonts.ready` is awaited. Limits reported with the run: canvas blank, `FontFace` API fonts missing, JS-driven layout shows the live structure (confidence lowered when inline widths differ from stylesheet widths). |
| 3 Capture        | `region` when widths match, the design height fits the viewport, the pane is closed and a stream exists (acquired once per session from the overlay's Capture pixels click, dropped on reload); `snapdom-live` when widths match otherwise; `snapdom-mirror` when widths differ. Device pixels downscaled to CSS pixels. Canvas boxes are masked.                                                                                                                                                                                                                                          |
| 4 Second opinion | When the page's fonts are fetchable web fonts and the stylesheets have nothing outside takumi's subset, takumi lays the snapshot out at the design width; its boxes are stored beside the mirror's with confidence from the spike's p95 (1 − p95 / 50 px). Shown in the overlay per row; never a count. Built in step 6.                                                                                                                                                                                                                                                                   |
| 5 Pair           | `runtime.pairers` with the voter and gate tables below; pins first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 6 Estimate       | For each paired text node whose font stack changed since its last estimate: the client renders the text in the scratch iframe at the live size and ships the PNG; the server trims to ink; on a match the live size is the estimate; else bisection for the lowest and highest matching size over `typeSearchMin` 8 to `typeSearchMax` 56 (about 12 renders) plus one 400-weight render for coverage (`boldCoverage` 1.2, `regularCoverage` 1.07). Cached per (text, font stack, foreground, background). Confidence 1 on a match, 0.5 for the ratio fallback.                             |
| 7 Align          | Global offset (scale fixed to 1/`scale`) by robust median of paired text boxes; per container the local offset of its paired children; a container whose children share an offset gets one `offset` item and its children none.                                                                                                                                                                                                                                                                                                                                                            |
| 8 Deltas         | `sideStyles` reads the paired node for `fontSize`, `lineHeight`, `fontWeight`, `radius`, `background`, `foreground`, `border`; sibling gaps and padding between paired nodes; `axis` from the dominant direction of consecutive paired siblings' design centres; `columns` as the count of distinct x bands among paired children, compared as counts. A node with no pair is `unbuilt`; a component with no pair is `extra`. Each delta carries `source`, `confidence`, `width`.                                                                                                          |
| 9 Decisions      | Excluded and image-slot anchors drop their pairs and mask their boxes; `accept-delta` drops that kind on that node; `tolerance` builds effective tolerances per pair; a pin whose anchor is gone is reported `pin lost`.                                                                                                                                                                                                                                                                                                                                                                   |
| 10 Report        | Score, stage, warnings, brief, stop (section 4); rank with `runtime.rankers` (impact = confidence × normalized size, top-down by containment within equal impact); store; push `report-updated`.                                                                                                                                                                                                                                                                                                                                                                                           |

**Voters** (ruling 17). Each returns 0 to 1 or abstains; weights are renormalised over the voters that apply, then self-calibrated: before assignment each voter's weight is scaled by how often its own top choice agrees with the consensus top choice (the weighted vote under base weights), minimum 0.1; gates are off during calibration. A voter is trusted when its calibrated weight is at least half its base weight.

| Voter     | Base weight | Score                                                                                                                                                                                                                      |
| --------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| text      | 0.3         | Dice coefficient of word bigrams; Levenshtein similarity when either string is under 6 characters; glyph runs (1 character, height under 14 px) abstain; against an `svg` or `img` containing the box, 1 − best word match |
| kind      | 0.1         | 1 when the node's kind class (heading, label, body, control, cell, container, media, from box size, text size and `within`) equals the component's (from tag, `role`, `aria-*`), 0.4 for text against media, else 0        |
| structure | 0.2         | 0.6 when the component is under the component paired to the node's `within` box, plus 0.4 × (1 − relative sibling-order distance)                                                                                          |
| style     | 0.1         | boxes: 1 − RGB distance / `segmentDistance` × 3, floored at 0; text: 1 − abs(ink height − 0.72 × font size) / (0.3 × font size), floored at 0                                                                              |
| geometry  | 0.2         | 0.4 × (1 − page distance / page diagonal) + 0.6 × max(0, 1 − local distance / 40 px), x weighted 0.5; text measured to the nearest glyph line rect                                                                         |
| pixel     | 0.1         | 1 − Hamming distance of 8×8 average hashes / 64                                                                                                                                                                            |
| hints     | 0.1         | share of matched tokens among React component name, list key, class names, `role`, `aria-label` and matched selectors against the node's kind class and text                                                               |
| twins     | 0.1         | the twin's pair confidence when the twin's component in the other target's latest stored run equals this candidate, else abstain                                                                                           |

**Assignment and gates.** Global greedy, most confident node first, with a per-node score cache invalidated for descendants when a box pairs.

| Gate               | Rule                                                                                                                  | Constant   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------- |
| per-kind exclusion | a box and a text node may share one element; two nodes of one kind may not                                            |            |
| wrapper collapse   | a wrapper with a single same-text or same-box child collapses to the child                                            |            |
| box overlap        | IoU at least `pairBoxIou` and area ratio under `pairBoxArea`                                                          | 0.3, 3     |
| text containment   | a text element stays open to any OCR line inside its box; when geometry is trusted the element must contain the line  |            |
| margin             | top minus runner-up at least `pairMargin`, or dominance: loses on no trusted voter and wins by `pairDominance` on one | 0.08, 0.15 |
| floor (ruling 22)  | abstain when top under `pairFloor` or under the median candidate plus `pairFloorMargin`                               | 0.3, 0.1   |

### 4. Stage, score, stop

`server/stages.ts` maps each item kind to a stage with an exhaustive `switch` over `DeltaKindName | 'unbuilt' | 'extra' | 'offset'`:

| Stage     | Items                                                                                         |
| --------- | --------------------------------------------------------------------------------------------- |
| structure | `unbuilt` (not `image`, and its `within` box is paired or it is top-level), `axis`, `columns` |
| content   | `text`, `fontSize`, `lineHeight`, `fontWeight`                                                |
| geometry  | `offset`, `inset-top`, `inset-left`, `gap-row`, `gap-column`, `padding`, `align`              |
| paint     | `background`, `foreground`, `radius`, `border`                                                |

`extra`, `unbuilt` images and `unbuilt` nodes inside unpaired boxes are informational. Warnings (`sample-data`) are a separate report field, outside every count, and the brief appends one line per warning after the stage items. The score is `[unpairedShare, structure, content, geometry, paint, residualShare]` where each stage entry is the sum of normalized item sizes (delta over tolerance, capped at 10), `unpairedShare` the area share of structure `unbuilt` nodes, `residualShare` the area share of tiles above `tileGate` with no item and no decision. Items are keyed by node id plus kind; an item whose value is unchanged for `stallRounds` 2 rounds is demoted out of the stage choice, not out of the counts. The brief is the first `briefSize` 5 items of the stage.

`round` and the stop rules advance only on `design_diff` (ruling 15); run 0 is round 0; `round` resets when a different image is registered and on acceptance. Stops are checked in this order and reported every round they hold:

| Stop            | Condition                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| `done`          | every count zero and `residualShare` under `residualAreaGate` 0.01                                            |
| `residual-only` | every count zero                                                                                              |
| `oscillating`   | an item's value differs from the previous round's and equals the one two rounds earlier, within its tolerance |
| `stalled`       | the tuple has not decreased lexicographically for `stallRounds` rounds on the same capture path               |
| `budget`        | `round` reaches `roundBudget` 8                                                                               |
| `null`          | otherwise                                                                                                     |

`DiffReportSchema` gains `stage`, `brief`, `warnings`, `round`, `budgetLeft`, `stop`, `score`, `capturePath`, `sources`, `segmentation`, `responsive`, `partial`, `limits` as optional fields with defaults; `StatusReportSchema` gains `score`, `round`, `stop`, `acceptedRun`, `reregister`; `done` is stop `done` or a score not lexicographically worse than `acceptedRun` on its capture path.

### 5. Text roles and the text delta

`shared/roles.ts`: `Role` (`placeholder`, `data`, `unknown`), `LiveRole` (`literal`, `expression`, `mixed`), and `textDelta({live, target})`:

| live \ target                | `placeholder`         | `data`                | `unknown`                        |
| ---------------------------- | --------------------- | --------------------- | -------------------------------- |
| `expression`                 | none                  | none                  | none                             |
| `mixed`                      | none                  | none                  | `text` on the literal parts only |
| `literal`, equal strings     | warning `sample-data` | warning `sample-data` | none                             |
| `literal`, different strings | none                  | `text`                | `text`                           |

### 6. The store

| File             | Contents                                                                                    | Lifetime                                              |
| ---------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `target.png`     | the image                                                                                   | target                                                |
| `model.json`     | root plus flat `nodes`                                                                      | target; rewritten when runs fill `typography`         |
| `record.json`    | `id`, `session`, `route?`, `name?`, `width`, `height`, `scale`, `createdAt`, `acceptedRun?` | target                                                |
| `decisions.json` | `{id, kind, anchor, value, at}[]`                                                           | target; kept across re-registration of the same bytes |
| `twins.json`     | twins per other target id                                                                   | target; rebuilt when a slice is added                 |
| `result-*.json`  | runs, pruned to `runsKept` except run 0 and the accepted run                                | target                                                |

A `model.json` that fails the schema yields `reregister: true` on `design_status`, never a silent drop. `TargetStore` gains `current`, `decisions`, `decide`, `revoke`, `accept`, `twins`, `latestRun`.

### 7. The overlay

The x-ray Solid app mounts in the app tab through `Surface` of `defineExtension`. `server/xray-routes.ts` gains `pin`, `unpin`, `mark`, `revoke`, `accept`, `capture` as server process HTTP routes, never tools. The pane shows rows grouped by stage with the stop; a design panel (the target image with node boxes); a page panel (this run's pixels and, when widths differ, carried boxes); a heat map (node × registered width, the stage of the node's worst item from each target's latest run, with confidence); pins and marks modes; accept; Capture pixels (the user activation for Region Capture); per row source, confidence, takumi opinion and twin disagreement (ruling 19). Clicking a row highlights the element.

### 8. Agent discovery

`DESIGN_GUIDE` in `shared/defs.ts`: "A design target is registered. Call `design_diff` to measure the live page against it, fix the brief, run it again, and stop when `stop` is set. Do not judge a design match from a screenshot." Returned as `next` on `design_target` and `design_status` while not done. `SystemPromptResolver` gains `{cwd, sessionId}` (core change) and the design server answers with the line when `store.current({session})` exists. `page_screenshot`'s hint points at `design_diff`. The design bullet in `CONCIV_COMMAND_GUIDE` is replaced (trigger words; `design target` with the image and an optional scale; build with the app's components before the first diff when the page is new; save, `design diff`, fix only the brief; stop when `stop` is set; never replace an expression with design text; never set a width or height to a pixel value). `@conciv/skills` gets `conciv-design/SKILL.md` rendered by a new exported `designSkillFile()` with a `## Sources` section, registered in `skill_tree.yaml`, with a unit test.

## Alternatives Considered

### A. Skill text only

Does not fix hard-coded sample data or a loop that never terminates.

### B. Launched Chromium

Renders the app outside the user's session; needs a browser install. Rulings 1 and 18.

### C. Hidden iframe of the app at the design width (today's frame)

A second render; stalls when covered; duplicated session state. Replaced by the mirror.

### D. Width from the tab or a tool argument

Binds a target to a tab size the user did not choose. Ruling 2. `design_winner` keeps an optional width because it explains CSS at a width and reads the mirror for it; that is a query, not a target key.

### E. Route as a lookup key

Optional, mistyped or shared routes break grouping; the session already groups. Route stays a label and a check.

### F. One blended geometry value from several sources

Hides a disagreement that is information. Ruling 16.

### G. Mirror only, no takumi

Fewer files and no wasm. Ruling 16 keeps takumi as an overlay-only second opinion in its own late step; skipping that step is this alternative.

### H. Rounds counted on every run

Eight saves exhaust the budget before the first `design_diff`. Ruling 15.

### I. Text pairing by string equality

Never fires a `text` delta; expression cells become "build this" items. Ruling 17.

### J. Pairing by a neural model or learned weights

No labelled data yet; hand weights plus self-calibration reached 0 wrong on the finished dashboard, 1.25% and 0.5% wrong on two real pages. Learning from pins later, same slot.

### K. Persistent automatic pairs with carry across image versions

A moved component must re-pair every round anyway; pins cover what the user cares about. One stored pair is read, for twins.

### L. SQLite store with events, undo and replay

A decisions file per target holds everything that persists.

### M. A decision engine (TypeSafe Jev) in this change

Answers questions rules answer for the fixture. Later behind `RoleRules` and `Ranker`.

### N. A node tree segmented from the image

Spike recall on real pages makes an inferred hierarchy wrong often enough to produce structure rows the page must not act on.

### O. Font size from an ink ratio

Misses by up to 9.6 px.

### P. Edge segmentation, or a Jev prune of its candidates

33 to 67 spurious boxes; Jev removes a third to a half while dropping real buttons.

### Q. OCR, segmentation and pixel compare in a tab worker

`paddle.ts` is Node-only; a browser path needs ppu's web build, models over HTTP and `wasmPaths` overridden; `design_target` would fail without a tab. Ruling 20: work runs where its data is.

### R. One capture path only

Region Capture cannot capture the mirror; snapdom is a second rasterizer. Both stay, recorded per run, never scored across.

### S. Continuous rrweb recording with a live Replayer as the mirror

Applies mutations on `requestAnimationFrame` (stale in a covered tab), keeps every event, patches CSSOM and canvas prototypes for the client's lifetime, resets the iframe width on resize events, and needs a sync point before every measurement. Runs are discrete, so a snapshot per run is enough. Ruling 21.

### T. A client registry selected by config

The choice between live document and mirror, and between capture paths, depends on run-time facts, never on config; `__client` receives no config. Branches inside the measurer.

### U. A residual stage for the agent

The agent would edit at random. The loop stops and the user accepts.

## Risks and Mitigations

| Risk                                                                                                                    | Mitigation                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Figma exports and Linux renders unmeasured for typography                                                               | Confidence under 1 once a trial shows drift; the estimate is cached and replaceable per renderer                                                     |
| snapdom rasterization differs from the spike's screenshots, for the estimate and for `residualShare` when widths differ | Step 3 test: `u1-1280` from a 1392 tab ends `done` on the unchanged fixture; estimate falls back to the ratio at confidence 0.5                      |
| The mirror shows the live JS structure at the design width; canvas blank; `FontFace` fonts missing                      | Limits reported per run; canvas boxes masked; confidence lowered when inline widths differ                                                           |
| Region Capture stream lost on reload or no frames while occluded                                                        | snapdom fallback after `captureFrameMs` 500; capture path recorded; stall never compares across paths                                                |
| Pairing cost (minutes on a 1500-element page in the Node spike)                                                         | One pending run, newer replaces; `runBudgetMs` 20 s then `partial`; spike cache and descendant invalidation carried; product cost measured in step 4 |
| Twin voter hurts when copy and layout both differ                                                                       | Weighted by the twin's confidence; abstains without a stored run; never primary                                                                      |
| Segmentation misses painted containers on dense pages                                                                   | `partial` reported; unpaired boxes outside paired containers informational                                                                           |
| OCR garbage on small text                                                                                               | Tiles, upsampling under 16 px, `ocrConfidenceFloor`                                                                                                  |
| Pin anchors drift with edits                                                                                            | Node ids content-derived; anchor is provenance site plus component path; `pin lost`                                                                  |
| Sensitive input values reach the mirror's PNG                                                                           | The snapshot uses `maskAllInputs`; the PNG stays under the state directory                                                                           |
| Tab memory: mirror, scratch iframe, snapdom rasters                                                                     | Mirror rebuilt and discarded per run; rasters transferred and dropped                                                                                |

## Non-Functional Requirements

- **Security and privacy**: nothing but the user's browser and the server process touches the page. Runtime network calls: the page's own fonts and, in step 6, takumi's wasm served by the server process. The overlay's write routes are server process HTTP routes with the reach of every other such route. Screen Capture asks once per session from a click; the stream is cropped to the app root. PNGs and JSON live under the state directory.
- **Performance**: a run reads rects and styles (milliseconds), one snapdom raster or frame, and blazediff in the server (tens of milliseconds at 1280 by 1136 in #683's tests). Registration: OCR 0.4 to 0.9 s plus tiles, segmentation 33 ms to 1.2 s. Pairing cost is the open measurement (Risks). The estimate adds up to 13 renders per distinct text, once. The agent's round cost is a brief of up to five sentences and the 12-row report, no image.
- **Rollout and rollback**: new report fields are optional with defaults; old models report `reregister`; deleting a target directory starts clean.

## Additional Resources

- `docs/designs/design-driver-rulings.md`, `docs/designs/spikes/`, `docs/superpowers/specs/2026-11-01-design-text-layer-spike.md`.
- Branch `design-loop-spike` (`0579e1809`, `924a407f5`, `16d611003`, `e2fd99425`), throwaway.
- `egm-review/driver/`, `driver-r2/`, `driver-r3/`, `driver-r4/`.
- takumi, rrweb-snapshot, snapdom, ppu, blazediff, Region Capture, TypeSafe docs.

## Future Improvements

- Jev behind `RoleRules` and `Ranker`; learned pairing weights from pins behind `Pairer`.
- Figma adapter.
- No-target breakpoint sweep (ruling 10) on the mirror.
- Predicted heat-map columns between design widths (carry at media-query breakpoints).
- Shadow and gradient delta kinds; other segmenters.

---

## Detailed Implementation Plan

A new branch off `main` after #683. Paths under `packages/`. One commit per step. Gates per step: `pnpm typecheck && pnpm lint && pnpm build` in `extensions/design`, `extensions/page`, `extension`, `core`, `harness-init`; `pnpm typecheck && pnpm lint && pnpm test` in `skills`, `cli`, `harness-init`; `pnpm exec turbo run build --filter='@conciv/it...'`; `cd packages/it && pnpm exec vitest run test/design.it.test.ts`; `pnpm exec fallow audit --changed-since <base>` at the root. Code rules: functions not classes, no IIFEs, no `else`, no `let` outside raster loops, no regex (code-point ranges for character classes), no casts, no `any`, no non-null assertions, one options-object argument, no comments, named exports, constants in `shared/tolerances.ts`. Integration tests go in `it/test/design.it.test.ts`; the one new test file is `skills/test/design-skill.test.ts`. Commit locally only; never push; never open a pull request. Trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

### Existing tests that change

Rule: every call in `design.it.test.ts` that passes `width`, `route` or `target` to `design_target`, `design_diff`, `design_status` or `design_capture` drops the argument (45 diff, status, capture, winner and clear calls plus 26 target calls); `design_clear` keeps `{target: id}` and gains `{all: true}`; `design_winner` keeps `width` and `height`. The current target is the one registered last in that test. Beyond the rule:

| Test (line)                                                                          | New expectation                                                                                                 |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| declares six design tools (259)                                                      | unchanged (`design_measure` is outside the catalog)                                                             |
| registers a PNG target (277)                                                         | width and height from the header; re-registering the same bytes keeps the id and decisions and makes it current |
| scales a retina export (286)                                                         | `scale: 2` divides the header width, with `u1-2560`                                                             |
| clear removes the targets of a route (294)                                           | clear by id, or all                                                                                             |
| captures the live page (299), height 900 (310), DPR 2 (317)                          | without a frame; `height` stays on `CaptureInputSchema`                                                         |
| unmatched `kind: 'extra'` (329)                                                      | `missing` is `unbuilt`; `extra` unchanged                                                                       |
| takes the live route and width (325)                                                 | route recorded as a label                                                                                       |
| u1-1280 diff (354)                                                                   | `warnings` carries `sample-data` for `INV-001`, `INV-002`, `1,200`, `860`; `deltas` unchanged                   |
| `fill` delta (345)                                                                   | deleted with the kind                                                                                           |
| no target (369), other route (379)                                                   | "no target registered" after `design_clear {all: true}`; the other-route diff is refused with a `route` item    |
| winner (398), breakpoint delta (564)                                                 | provenance read from the mirror's snapshot, which keeps `href` and `data-vite-dev-id` on sheets                 |
| status without a route (521), pruning (530)                                          | the session's current target; pruning spares run 0 and the accepted run                                         |
| done (508, 1020, 1040)                                                               | still `done`: warnings are outside the counts                                                                   |
| 390 through a hidden frame (541), clear removes the frame (573), frame blocked (578) | the 390 target is measured in the mirror with `source: 'mirror'`, `width: 390`; frame cases deleted             |
| viewport chip (687), width without a run (743), arrow keys (768)                     | the chip switches between the session's targets; the x-ray tests register both `u1-1280` and `u1-390` first     |
| stale badge (835)                                                                    | cleared by an HMR run                                                                                           |
| `Export` text (1061)                                                                 | an expression: no `text` delta                                                                                  |
| text runs read once (991)                                                            | `TargetResult.text` unchanged; the lines are `text` nodes in `model.json`                                       |
| `./paddle` imports (42, 1156–1305), `trimToInk` (1293), disposal (1334)              | unchanged: `./paddle` keeps re-exporting `trimToInk`                                                            |

Outside the IT: `cli/test/cli.test.ts:249-252, 314-326, 360-361` and `harness-init/test/harness-init.test.ts:612` to the new text and without `--width`.

File paths in the items below are the plan as drafted; the code landed in the tree of Technical Plan section 1 (one slot file per table), and every item that names a file per implementation is a private function in the slot file. Each step ends with an "As built" note recording what differs from the item text.

Step 0 (spike records committed under `docs/designs/spikes/`) was dropped: spike code does not ship.

### Step 1: core channel; target is an image; current target per session; discovery

2. `extension/src/types.ts`, `extension/src/define-extension.ts`, `extension/src/tool-registry.ts`, `core/src/page-bus.ts`, `core/src/tool-registry.ts` (Modify): `ServerApi.page.ask({sessionId, name, input, timeout})`; client tool defs gain `catalog?: boolean`; `SystemPromptResolver` receives `{cwd, sessionId}`.
3. `extensions/design/src/server/differ.ts` (Create), `tool/server.ts` (Modify): `createDiffer({runtime, store, page})`; `run` performs today's diff until step 4.
4. `extensions/design/src/shared/defs.ts` (Modify): `TargetInputSchema` `{image, scale?, route?, name?}`; `DiffInputSchema` and `StatusInputSchema` lose `target`, `route`, `width`; `ClearInputSchema` `{target?} | {all: true}`; `CaptureInputSchema` loses `width`; `WinnerInputSchema` unchanged; `DESIGN_GUIDE`; `next`; summaries; `width-required` error removed; the `no-target` message; `DESIGN_TOOL_DEFS` unchanged in count.
5. `extensions/design/src/shared/types.ts` (Modify): `TargetAdapter.load({ref, scale, cwd})`; `TargetRecord` gains `session`, `acceptedRun`, optional `route`; `TargetStore` gains `current`, `decisions`, `decide`, `revoke`, `accept`, `latestRun`; `Decision`, `DecisionKind`.
6. `extensions/design/src/server/adapters/image.ts` (Modify): header width divided by scale; `scaleToWidth` removed.
7. `extensions/design/src/tool/steps/target.ts`, `diff.ts`, `status.ts`, `clear.ts`, `capture.ts` (Modify): `store.current({session})`; `assertLiveRoute` and `route-mismatch` deleted; `targetWidth` removed; `findTarget` by id then current.
8. `extensions/design/src/server/store.ts` (Modify): the record fields; `current`, `decisions`, `decide`, `revoke`, `accept`, `latestRun`; pruning spares run 0 and the accepted run; `decisions.json`; unparsable model yields `reregister`.
9. `extensions/design/src/server.ts` (Modify): the system prompt line from `store.current({session})`.
10. `extensions/design/src/xray/data.ts` (Modify): `runDiff` and `diffCommand` drop `--target --width`.
11. `extensions/page/src/shared/defs.ts` (Modify): the `page_screenshot` hint.
12. `harness-init/src/agent-guide.ts`, `harness-init/src/claude/plugin-files.ts` (Modify): the design bullet; `designSkillFile()` exported; `harness-init/test/harness-init.test.ts`, `cli/test/cli.test.ts` (Modify).
13. `skills/skills/conciv-design/SKILL.md` (Create), `skills/skills/_artifacts/skill_tree.yaml` (Modify), `skills/package.json` (Modify), `skills/test/design-skill.test.ts` (Create).
14. `it/test/design.it.test.ts` (Modify): the step 1 rows of the table; new `it`s:
    - `design_diff` with no argument diffs the newest target of the session.
    - `design_target` returns `next` with the guide.
    - `design_status` reports the current target.
    - registering a second image makes it current; registering the first again makes the first current and keeps its id.
    - `design_clear {all: true}` then `design_diff` reports the no-target sentence.

As built (PR #690, with step 2 and the restructure): as the items say; the differ lives in `server/differ.ts` and the tool steps are its bindings, `tool/` is gone.

### Step 2: the flat list from the image

15. `extensions/design/src/shared/model-schemas.ts` (Move from `store.ts:27-61`, Modify), `shared/types.ts` (Modify): flat `TargetNode`, `Segmenter`, `RoleRules`, `Enricher.run({model, raster, runtime})`; consumers updated: `adapters/image.ts` root kind, `target.ts` `enrich`, `tool/steps/diff.ts:190` (`root.children`), `server/matchers/tile.ts`, `text-groups.ts`, `xray/*`, color enricher, IT `StoredModelSchema`.
16. `extensions/design/src/server/raster.ts` (Modify), `server/comparators/paddle.ts` (Modify): `trimToInk`, `differs` move to `raster.ts` and `paddle.ts` re-exports them; `expand` moves from `matchers/` to `raster.ts`; `inkCoverage`, `cornerRadius` added; `deltas/insets.ts` `differs` renamed `insetDiffers`.
17. `extensions/design/src/server/enrichers/text.ts` (Create), `tool/steps/target.ts` (Modify: `readText` removed).
18. `extensions/design/src/server/segmenters/threshold.ts`, `server/enrichers/segment.ts` (Create).
19. `extensions/design/src/shared/roles.ts`, `server/roles/rules.ts`, `server/roles/live.ts`, `server/enrichers/roles.ts` (Create); `shared/defs.ts` (Modify): `DeltaSchema` gains `warning`; `DiffReportSchema` gains `warnings`, `segmentation`; `tool/steps/diff.ts:199-203` (Modify): `textDelta` applied where `text` deltas are built.
20. `extensions/design/src/shared/config.ts`, `server/registries.ts`, `server/registries/enrichers.ts`, `server/registries/{segmenters,roles}.ts` (Modify, Create).
21. `extensions/design/src/shared/tolerances.ts` (Modify): `segmentDistance` 10, `segmentImageShare` 0.3, `ocrConfidenceFloor` 0.6, `ocrUpsampleBelowPx` 16.
22. `it/test/fixtures/design/host/src/App.tsx`, `Table.tsx`, `render-targets.ts` (Modify): the table renders cells from a data array by default (expressions); a `hardcoded` variant renders one amount as a literal; a `roles` variant adds `[Customer Name]` and `$1,200` cells to the data; shots `roles-1280` and `hardcoded-1280`.
23. `it/test/design.it.test.ts` (Modify): `describe('nodes')`:
    - registering `u1-1280` yields box nodes for the toolbar, each card and the table within 2 px.
    - the `Export` text node has `within` the first button.
    - `roles` against `roles-1280` reports no `text` delta and no warning.
    - `hardcoded` against `hardcoded-1280` reports a `sample-data` warning and `done`.

As built (PR #690): enrichers, the segmenter and the role rules are private functions in `server/target.ts`; `model-schemas.ts`, `roles.ts`, `config.ts` and the registries folded into `shared/` and `server/target.ts`.

### Step 3: measurer, mirror, capture every run, sources

24. `extensions/design/src/client/measurer.ts`, `client/mirror.ts`, `client/scratch.ts` (Create), `client/components.ts` (Modify: shadow roots, border in `readStyles`), `client.ts` (Modify: `createMeasurer`, `design_measure` registered with `catalog: false`), `shared/measure.ts` (Create).
25. `extensions/design/src/client/capture.ts` (Modify: `region`, `snapdom-live`, `snapdom-mirror`, DPR downscale, canvas masking), `client/frame.ts`, `client/frame-capture.ts` (Delete), `client/winner.ts` (Modify: another width reads the mirror's document), `tool/steps/winner.ts` (Modify), `server/captures/tab.ts` (Modify: calls `page.ask`), `shared/defs.ts` (Modify: `frame-blocked`, `frame-timeout` errors removed; `Delta` gains `source`, `confidence`, `width`; `Side` and `LiveComponentSchema` gain `columns`, `liveRole`, `border`; `DiffReportSchema` gains `capturePath`, `sources`, `limits`), `shared/config.ts` (Modify: `capture` enum removed), `server/registries/captures.ts` (Delete), `shared/tolerances.ts` (Modify: `frameSettleMs`, `captureBudgetMs` removed; `captureFrameMs` 500, `measureTimeoutMs` 60000).
26. `extensions/design/src/server/breakpoints.ts` (Delete), `tool/steps/diff.ts` (Modify: `withBreakpoints` import removed; `breakpoint` becomes `width`).
27. `extensions/design/src/client/estimate.ts`, `server/estimate.ts` (Create): the render protocol and the server-side trim and bisection; `shared/tolerances.ts`: `typeSearchMin` 8, `typeSearchMax` 56, `boldCoverage` 1.2, `regularCoverage` 1.07.
28. `it/test/fixtures/design/host/src/App.tsx`, `styles.css`, `public/fonts/` (Modify, Create): a `type` variant rendering the typography spike's check strings at 12, 16, 24 and 32 px in a bundled OFL woff2, with a `type-1280` shot; the `badge` variant unchanged.
29. `it/test/design.it.test.ts` (Modify):
    - a diff against `u1-390` from a 1280 tab reports rows with `source: 'mirror'`, `width: 390`, `capturePath: 'snapdom-mirror'`.
    - the unchanged fixture against `u1-1280` from a 1392 tab ends `stop: 'done'`.
    - `design_capture` returns the live page at 1x at DPR 2 without a frame.
    - on `type` against `type-1280`, every text node's `typography.size` is within 0.5 px of its live font size with confidence 1.
    - `design_winner` with `width: 390` names `src/card.module.css`.

As built (PR #696): the measurer, mirror, capture and type renders live in `client.tsx`; the type estimate's trim and bisection in `server/target.ts`; `design_measure` and `design_render` are hidden client tools; `shared/measure.ts` folded into `shared/defs.ts`.

### Step 4: pairs, twins, alignment, delta kinds, stage, score, stop, runs

30. `extensions/design/src/server/pairers/vote.ts`, `server/align.ts`, `server/rankers/impact.ts`, `server/twins.ts` (Create), `server/registries/{pairers,rankers}.ts` (Create), `server/matchers/` and `server/comparators/edge-projection.ts` (Delete), `server/registries/{matchers,geometry}.ts` (Delete), `shared/config.ts` (Modify: `geometry`, `matcher` enums removed), `server/unmatched.ts`, `shared/above.ts`, `shared/defs.ts` `UnmatchedSchema`, `xray/data.ts` `Row.unmatched` (Modify: `missing` to `unbuilt`; `aboveTolerance` counts structure `unbuilt` only; `mismatch` from the pixel comparator's tile mask), `shared/types.ts` (Modify: `Pair` gains `node`, `source`, `confidence`; `Matcher`, `GeometryEstimator`, `Comparators.geometry` removed).
31. `extensions/design/src/server/deltas.ts` (Modify), `server/deltas/border.ts`, `axis.ts`, `columns.ts` (Create), `server/deltas/fill-align.ts` (Delete), `server/provenance/delta-properties.ts` (Modify), `shared/defs.ts` `DELTA_KIND_NAMES` (Modify).
32. `extensions/design/src/server/stages.ts` (Create), `shared/fix-sentence.ts` (Move from `xray/fix-prompt.ts` `sentence`, `traced`), `xray/fix-prompt.ts` (Modify).
33. `extensions/design/src/server/runs.ts` (Create), `server.ts` (Modify: `hmr-update` plus settle), `extensions/page/src/client/hmr.ts`, `extensions/page/src/server.ts`, `extensions/page/src/shared/defs.ts` (Modify: the settle handshake from `0579e1809`, forwarded over the bundler bridge), `tool/steps/diff.ts` (Modify: awaits the newest run; advances `round`).
34. `extensions/design/src/server/store.ts` (Modify: `twins.json`, `twins`).
35. `extensions/design/src/shared/tolerances.ts` (Modify): `roundBudget` 8, `stallRounds` 2, `briefSize` 5, `residualAreaGate` 0.01, `runDebounceMs` 150, `runBudgetMs` 20000, `pairBoxIou` 0.3, `pairBoxArea` 3, `pairMargin` 0.08, `pairDominance` 0.15, `pairFloor` 0.3, `pairFloorMargin` 0.1, `pairMinWeight` 0.1.
36. `extensions/design/src/shared/defs.ts` (Modify): `stage`, `brief`, `round`, `budgetLeft`, `stop`, `score`, `responsive`, `partial`; `StatusReportSchema` fields; the `offset` item schema.
37. `it/test/fixtures/design/host/src/App.tsx`, `Cards.tsx`, `Table.tsx`, `card.module.css`, `styles.css` (Modify): `empty` (the route renders nothing), `column` (the card row as a column flex), `grid` (the table as a CSS grid with four columns), `bordered` (the row border color changed), `shifted` (the toolbar's first button rendered from a literal `<button>Make</button>` branch).
38. `it/test/design.it.test.ts` (Modify): `describe('loop')`:
    - `bordered` reports a `border` delta, `stage: 'paint'`, a brief of at most five sentences, `round: 1`.
    - `column` reports an `axis` delta under `stage: 'structure'`.
    - `grid` reports a `columns` delta.
    - nine `design_diff` calls on an unchanged `bordered` page end `stop: 'stalled'` before `budget`.
    - one `design_diff` then five `HOST_STYLES` rewrites leave `round` at 1 on `design_status`.
    - `empty` against `u1-1280` reports every non-image node `unbuilt` and `stage: 'structure'`.
    - `shifted` pairs the first button and reports a `text` delta, no `unbuilt`.
    - registering `u1-390` then `u1-1280` yields `twins.json` on both and a `responsive` section.
    - a run after an HMR edit (test 835's `HOST_STYLES` rewrite, restored after) carries a diff image different from the previous run's.
    - the pairing of `u1-1280` against the finished fixture completes under `runBudgetMs` and reports no `partial`.

As built (PR #700): pairing, ranking, alignment and `pairTwins` in `server/pair.ts`; items, stages, score, brief, stop, round history, the run queue and the HMR settle in `server/loop.ts`; `deltaSentence` and `traced` in `shared/tolerances.ts`. The HMR handshake runs server to page: the page client records applied update timestamps and the server asks `page_hmr {since}` after the debounce (the bundler bridge cannot publish an event without touching `protocol` and `plugin`). Registration awaits run 0 (a background run 0 raced the test's navigations). Border, radius and axis are read from pixels on both sides. The stage table names stay `gap-before`, `gap-after` and the four `inset-*` kinds. `extra` entries are painting elements of at least 24 px, top-most only; offsets are `unmatched` entries of kind `offset`. The hints voter abstains when no token matches; the floor's median is over the whole candidate pool; ranking weighs measurement confidence. `responsive` is `{target, width, twins, absent[], reordered[], stretched[]}` per other width. Two IT cases were edited beyond the table: the recolor case no longer asserts exact kinds, and "a width without a run" registers from `/plain.html`.

### Step 5: the overlay

39. `extensions/design/src/client.tsx` (Move from `client.ts`), `vite.config.ts`, `package.json` (Modify: Solid plugin and entry; `solid-js`, `@tanstack/solid-router`, `@conciv/ui-kit-system`, `@unocss/reset` as dependencies), `xray/entry.tsx`, `xray/index.html` (Modify: dev fixture only).
40. `extensions/design/src/server/xray-routes.ts`, `xray/data.ts`, `xray/xray-schemas.ts` (Modify): `pin`, `unpin`, `mark`, `revoke`, `accept`, `capture`; rows carry `stage`, `source`, `confidence`, `warning`, `width`, `opinion`, `twinDisagreement`.
41. `extensions/design/src/xray/pins.tsx`, `xray/marks.tsx`, `xray/heatmap.tsx` (Create); `xray/stage.tsx`, `panel.tsx`, `rows.tsx`, `routes/*.tsx`, `shortcuts.ts`, `xray.css` (Modify).
42. `it/test/design.it.test.ts` (Modify): `describe('x-ray page')` cases for the overlay opened from the widget, plus:
    - pinning an unpaired toolbar text node to a toolbar component on `shifted` removes its `text` row.
    - excluding a region removes its rows next run.
    - accepting a run turns `design_status` done.
    - the stale badge is gone after an HMR run.
    - a run with a different `capturePath` is not compared for `stalled`.

As built (PR #702): the pane is `XrayPane` in `xray/router.tsx` (one `createXrayRouter({history, context})` serves the standalone page with browser history and the pane with memory history); pins, marks, accept, Capture pixels and the row outline in `xray/decisions.tsx`; the heat map in `xray/heatmap.tsx`; no `pins.tsx`, `marks.tsx`, `data.ts` or `xray-schemas.ts`. The button sits in the composer's overflow menu like the whiteboard's. The pane is mounted one layer under the widget, so an open chat panel covers part of it (open: open the pane with the chat minimized, or beside it). The new controls are in the in-tab pane only; the standalone page keeps its look. Routes also include `current` and `stamp`; the pane refreshes by asking for the latest run stamp every two seconds. `accept` takes only the target id and starts no run. Excluding or image-slotting a node drops the nodes inside it. Reports carry each component's `nodes` and `path`, and each unbuilt entry's `node`. The pin IT case pins through the route (the grab has no on-page signal a test can wait on).

### Step 6: takumi second opinion

43. `extensions/design/src/client/sources/takumi.ts`, `client/sources/serialize.ts`, `client/sources/subset.ts` (Create); `package.json`, root `pnpm-workspace.yaml` (Modify: `takumi-paint`, `@takumi-rs/wasm`); `server.ts` (Modify: serves the wasm under the extension's static route); `shared/defs.ts` (Modify: `opinion` on deltas).
44. `it/test/fixtures/design/host/src/App.tsx`, `styles.css` (Modify): a `webfont` variant using the bundled woff2 everywhere; a `container` variant adding an `@container` rule to it.
45. `it/test/design.it.test.ts` (Modify):
    - `webfont` against `u1-390` stores an `opinion` beside the mirror value on geometry rows.
    - `container` disables takumi and reports `mirror` only.

As built (PR #703): one file, `client/takumi.ts` (subset check, fonts, serialization, paint, boxes); the opinion runs inside `measureMirror` only, so `sources` is `['mirror', 'takumi']` when it ran. The wasm served is takumi-paint's own `takumi_paint_wasm_bg.wasm` (2.9 MB) under `/api/ext/design/takumi/`; `@takumi-rs/wasm` is not a dependency. The inset, gap and align kinds expose `read(side)` and their deltas carry `opinion: {source: 'takumi', live, confidence}`; `offset` is an unmatched entry and carries none. `ComponentReport.twinDisagreement` names the other target and path. Confidence `1 − p95 / 50` with p95 1.7 px wide and 7.4 px under 1000. The client reads the engine's API base from the `Surface` into a module slot. Measured on the fixture at 390: 59 ms for the first opinion, 4 to 6 ms after.

### Step 7: READMEs and trials

46. `extensions/design/README.md` (Modify); there are no `src/**/README.md` files (structure rule 4).
47. `docs/designs/trials/` (Create): the reference dashboard built from empty; an existing page matched to a re-export; a page at a tab width different from the design. Each records rounds to stop, stop reason, score per round, sources and capture path per round, pins and marks, and where the agent went wrong; each passes when it ends `done` or `residual-only` within the budget. The trials run through `packages/it/scripts/design-trial.ts` (`pnpm trial` in `packages/it`), which boots the fixture host with conciv, registers an image and drives `design_diff`, `design_status`, pins, marks and accept from the command line.

As built (PR #704): the harness is `packages/it/scripts/design-trial.ts` with `diff`, `status`, `pin`, `mark`, `accept`, `screenshot`, `quit` and a `--render` flag that writes the fixture's design images. Two trials pass (`re-export` and `other-width`, `done` at round 2, the latter mirror-only with no resize asked). The build-from-empty trial fails: `budget` at round 8 with content stuck at 197.2 on OCR and type-estimate misreadings. Its record lists eight defects with reproductions, left unfixed: an OCR line spanning several elements becomes an unclearable "build the text" item; a text node pinned to a container compares against the container's empty text; the type estimate reads a filled shape behind light text as ink; a same-string text about 10 px off is "build" rather than "move"; a card with a near-same-box child stays unpaired; a padded pill reports "move by -8,-8" every round; excluding a pinned node reports `pin lost` every round; `design_status` keeps `next` after `stop: budget`. These are the backlog for the next revision.

### Verification Plan

- **Build and static**: the gates above per step; `pnpm intent:validate` and `check:refs` in `skills`.
- **Integration**: every existing case green as rewritten plus `nodes`, `loop`, sources, overlay and takumi cases. The five-rewrites case proves ruling 15; the `u1-390` case proves width never comes from the tab; the 1392 case proves `done` is reachable through the mirror; the `runBudgetMs` case bounds pairing cost.
- **Manual**: `pnpm trial` in `packages/it` against the pane in Chromium (Region Capture granted) and Firefox (snapdom); the three trial records under `docs/designs/trials/`.

---

_Drafted with EGM_
