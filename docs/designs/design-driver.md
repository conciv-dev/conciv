# Design driver: from "build this page from this image" to a matching page

- **Author:** Omri Katz (omridevk)
- **Status:** Proposed (seventh revision; rulings 1 to 22, four EGM review rounds, the as-built notes through step 7 and step 8 from the two harness runs folded in)
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

A moved component must re-pair every round anyway; pins cover what the user cares about. One stored pair is read, for twins. Reversed by ruling 25 (step 11): on the stripe page re-pairing from nothing costs more than the few moved components, so pairs carry across runs keyed by content hashes and re-pair only under the files an HMR touched.

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

### Step 8: the loop under a real page

Found by two runs with the real harness on 2026-11-02 (records under the session scratchpad `demo-run-a/findings.md` and `demo-run-stripe/findings.md`): the invoice dashboard (1136 px) and the top 3600 px of stripe.com at 1280. On stripe every `design_diff` returned `components: []`, `partial: true` and the same score, then `stalled`: `runDiff` takes `started` before the measure, the measure of a 3600 px page takes 15 to 40 s, and the pairer gets `deadline = started + runBudgetMs` already in the past, so `runVote` returns before its first assignment. On the dashboard the loop stalled on a frozen tuple while the mismatch improved, and a demotion was lost because unmatched items are keyed by list index. Alternative K (no carry of pairs across rounds) stands: nothing here needs it, and the pairing cost on a real page is unknown until the clock is right.

48. `extensions/design/src/shared/tolerances.ts` (Modify): `runBudgetMs` becomes `pairBudgetMs` 20000, counted from the moment the pairer starts; the measure keeps `measureTimeoutMs` 60000 and is the only thing that waits on the page. `server/differ.ts` (Modify): `started` is taken per phase; the report gains `timings: {measure, compare, pair, total}` in ms (`shared/defs.ts` `DiffReportSchema`, `TimingsSchema`).
49. `extensions/design/src/server/loop.ts` (Modify): a run with `partial: true` is not appended to the round history, does not advance `round` or spend `budgetLeft`, carries `stop: null`, and its `hint` says which phase was cut short and that nothing paired; run 0 (registration) is never a prior for `stalled` or `oscillating` (history starts at the first `design_diff`); unmatched items are keyed by `node` id (for `offset`, `extra` and image entries by the live or target box), never by list index, so a demotion survives an insertion; when `stop` is `stalled` the brief's first line names the items that did not move (`stalled: <n> items unchanged for 2 rounds: <first three sentences>`).
50. `extensions/design/src/shared/defs.ts`, `server/tool-bodies.ts` or wherever `design_diff` builds its output (Modify): the default output is the compact report `{target, round, budgetLeft, stage, stop, score, mismatch, brief, timings, counts: {components, unmatched, warnings}, rows, xray, diffImage, livePath, capturePath, sources, partial, hint}` where `rows` is the first ten items of the stage as `{sentence, stage, node?, source?}`; `design_diff({full: true})` returns the full `DiffReport` as today. The tool's declared `outputSchema` is the compact schema, so the description the harness generates is a few hundred characters instead of 29 k. `design_status` is unchanged. The x-ray routes keep reading the full report from the store.
51. `it/test/design.it.test.ts` (Modify), `describe('loop')` gains:
    - two `design_diff` calls on an unchanged page after registration report `stop: null`; the third reports `stalled` (run 0 is not a prior).
    - a `design_diff` on `bordered` carries `timings` with `pair` under `pairBudgetMs` and `measure` under `measureTimeoutMs`, and `partial: false`.
    - the default `design_diff` output has `rows` and `counts` and no `components`; `design_diff({full: true})` has `components`.
    - on `empty` against `u1-1280`, two `design_diff` calls then an edit that adds one unbuilt region (a `HOST_STYLES` rewrite that hides a component) keeps the demoted text items demoted: the stage of the third report is not `structure` for those keys, read through `full: true`.
      Existing cases stay as written; the nine-calls `stalled` case still passes because the stall is counted from the first `design_diff`.
52. `extensions/design/README.md` (Modify): the compact report, `full`, `timings`, the partial rule and the run-0 rule in the Tools section.
53. `extensions/design/src/server/target.ts` `renderInks`, `client.tsx` `renderStep` (Modify): on the built stripe page the typography estimate asked the page to paint about 150 text samples in one `design_render` call with no timeout, so the page bus gave up after its 5 s default (`timeout: design_render: page did not reply`) and the whole diff failed; three such calls, each in a 4096×4096 scratch iframe beside a 3600 px capture, crashed the tab. The server sends renders in chunks of at most `renderChunk` 24 samples (`tolerances.ts`), each call with `timeout: measureTimeoutMs`; the client sizes the scratch iframe to the widest and tallest sample of the chunk plus a margin, never to a fixed 4096; a failed or timed-out render chunk skips the typography estimate for those samples, records a `typography-skipped` warning on the report, and the run is still reported. IT: a `design_diff` on a fixture whose text runs exceed one chunk reports `partial: false` and no `typography-skipped` warning.

### Step 9: a layout, not a painting

The stripe run built the page as a painting of the image: every block `position: absolute` with `left`, `top`, `width` and `height` in px (`stripe.css`, 60 of 64 rules). The tool caused it. The design model is a list of boxes, and the brief hands the boxes to the builder ("build the box the design shows at 0,0 (232×1136)"), so the builder copies coordinates. Ruling 23: the design dictates a layout; a box is metadata on a layout node, never the ask. The model gains a layout pass that turns the segmentation tree into containers with a direction, a gap, an alignment and a sizing rule per child, and every sentence, delta and row speaks in those terms. Pixel boxes stay in the model and the x-ray for pairing and overlays, and a px number reaches the brief only inside a geometry delta on a paired element. The measure already carries `axis` and `columns` per live element and the delta engine already infers `flow` between sibling boxes (`deltas.ts` `flowBetween`); the layout pass generalises that to the whole tree.

54. `extensions/design/src/server/target.ts` (Modify), the layout pass after segmentation, stored in `model.json` and in the target node (`TargetNode.layout`): for every node with children, `direction` (`row` when the children's tops agree within `layoutTolerance` 4 px and their lefts increase, `column` when their lefts agree and their tops increase, `grid` when the children fall on both a row and a column lattice, `stack` when neither), `gap` (the median distance between consecutive children on the direction axis, in px, with `uniform: true` when every gap is within tolerance of the median), `align` on the cross axis (`start`, `center`, `end` or `stretch` when the children fill the parent on that axis), and `wrap` when a row's children continue on a second line of the same lattice. For every child, `size` on the direction axis: `fill` when the children share the parent's width equally within tolerance (equal widths and a gap that sums to the parent), `fit` when the box hugs its text (text node, or the box is within tolerance of its glyph box), `fixed` otherwise, with the px as metadata (`box` is already there). Padding is the inset from the parent's box to its children's union, per side. Cost: one pass over the tree, no pixels read; a node with one child is a `stack` with padding.
55. `extensions/design/src/server/loop.ts` `entrySentence`, `shared/defs.ts` `UnmatchedSchema` (Modify): an unbuilt entry carries `layout` (the node's own layout when it has children, else its parent's direction and its `size` in it). The sentence is the layout, not the box: `build a row of 4 cards under the hero: equal width, gap 24, align start, padding 0 40` for a container; `build the text "Payments" as the 2nd item in the nav row` for a child; `build a column: a heading (fit), a paragraph (fit), a row of 2 buttons (gap 12)` for a container whose children are all unbuilt (one sentence for the subtree, the children are not listed again until the container pairs). No sentence states x, y, width or height. `design_target`'s `next` reads `the brief names rows, columns, gaps and sizing rules; build with flow, flex and grid, never from coordinates`.
56. `extensions/design/src/client.tsx` `readStyles`, `shared/defs.ts` `LiveStylesSchema`, `server/differ.ts`, warnings enum (Modify): the measure reads `position` and whether `width` and `height` come from the element's own rule as a px length (`sizing: {width, height}` as `fixed | auto`, from the existing own-vs-parent property read, not the computed px). A report warning `painted` `{count, total, sources}` fires when the outermost absolutely or fixed positioned elements (parent not positioned) are more than `paintedShare` 0.1 of the measured components or more than `paintedCount` 3; it is never scored and when present the brief's first line is `painted: <count> elements are absolutely positioned; lay the page out with flow, flex or grid and let the browser place them`. A paired element whose design `size` is `fill` or `fit` and whose live `sizing` is `fixed` is a `sizing` delta in the geometry stage (`live: fixed, target: fill`), one per element, and the geometry sentence asks for the rule (`let the card fill the row (flex: 1); it is sized 290 px`) rather than a px nudge.
57. `it/test/design.it.test.ts` (Modify), `describe('loop')` gains: on `empty` against `u1-1280` the first brief line names `a row of` for the card run and no brief line contains `×` or `at 0,`; a `painted` fixture variant (`App.tsx`: the cards from a literal absolute-positioned branch with px boxes) reports the `painted` warning with `count` 4 and a `sizing` delta per card once they pair; `u1-1280` on the default variant reports no `painted` warning and no `sizing` delta. `model.json` for `u1-1280` records `direction: row` and `size: fill` for the cards (`describe('target')`). `extensions/design/README.md` (Modify): the layout pass, `painted`, `sizing` and the layout sentences.

### Step 10: pairing a rebuilt page

The third stripe run (2026-11-03, flow layout, 8 rounds, `stop: budget`) is the first time the product pairer met a page built by someone else. It paired 89 of 199 design nodes down to y 3495 and left 110 unbuilt. The investigation (session scratchpad `pair-investigation/findings.md`, reproduced on a copy of `pair.ts` against the dumped measure) sorted the 110: 80 ties (top minus runner-up under `pairMargin` 0.08 with geometry untrusted, mostly the dashboard mock at y 2160–2880 where the live page renders other sample data), 17 rejected by the text containment check after another text claimed the element first, 9 with no candidate, 4 under the floor. Three product defects and one report defect come out of it; the spike's "finished" rows never showed them because there every candidate sits where the design says.

58. `extensions/design/src/server/pair.ts` `elementGate` (Modify): the containment test for a text node (`pair.ts:393` when geometry is trusted, `pair.ts:395` when the element is already held by a text) tests that the centre of the design box lies inside the candidate box expanded by `tileMargin`, not that the whole box does, and it applies to the first claimant as well as to later ones, so the result no longer depends on take order. Measured on the run's data: 89 → 93 pairs, "Embed payments" (`bb458f09`, 1 px outside today) and "Flexible solutions…" (`da931653`, an OCR line straddling the `h2` and its child span) pair, no existing pair changes, one pair lost ("Usage meter"). Ruling 24 replaces the containment sentence in ruling 21.
59. `pair.ts` calibration (Modify): the agreement that weights a voter (`pair.ts:447-473`) is counted over design nodes whose consensus top score is at least `pairFloor`; nodes with no confident consensus (content the live page does not have) are left out, so absent content no longer drags geometry under trust. Measured cause: geometry agreement 83 of 199 = 0.42 against a trust line of 0.5, with the disagreements clustered on the cart, chat and table rows the agent never built; with geometry trusted the 80 ties have a tiebreaker ("canada" 0.836 vs 0.835).
60. `pair.ts` `passes` or the vote (Modify): a text node whose text voter and structure voter both abstain (a glyph under `GLYPH_RUN_HEIGHT` with an unpaired parent) is refused, never paired on kind, style, geometry and pixel alone. Today the phantom "7" (11×11, the card icon) took the "Sign up with Google" button at 0.665 and locked the button's real text out. The refused node stays `unbuilt` with `stage: null`.
61. `server/differ.ts` `reportedComponents`, `shared/defs.ts` compact `counts` (Modify): `counts` gains `paired` (pairs in the run) and `unbuilt`; when the components list was cut to `limit`, `hint` says `showing 12 of 89 paired components, those with deltas first; full: true lists every one`. Today the agent and the reviewer both read `components: 12` as 12 pairs.
62. `server/loop.ts`, `server/differ.ts` (Modify): a `design_diff` whose live capture hash equals the previous run's does not advance `round` or spend `budgetLeft`; its report repeats the previous round with `hint: the page has not changed since the last diff`. In the run each edit cost two rounds because the agent called `design_diff` twice. The capture hash covers the raster bytes and the decisions, so a pin or drop between two diffs is not hidden by a repeat. Four existing cases produce `stalled` by diffing an unchanged page nine times; Omri's ruling (2026-11-03): `stalled` means "you edited and nothing moved", so those four cases are amended to make one non-improving stylesheet edit per round, the only edit of existing tests this design allows.
63. `it/test/fixtures/design/host/src/Stripe.tsx`, `stripe.css`, `App.tsx` (Create, Modify): the agent's rebuild becomes the `stripe` variant (files from the session scratchpad `demo-run-stripe3/fixture/`); `it/test/fixtures/design/stripe-1280.png` (Create) is the registered image (`candidates/stripe-3600.png`). `it/test/design.it.test.ts` (Modify), `describe('pairing')` gains: `stripe` against `stripe-1280.png` reports `counts.paired` at least 93 with `bb458f09`, `da931653`, `2332a289` and `ed1ee3d9` paired (ids are content hashes of kind, box and text, stable for the same image) and no pair whose node is a single glyph; `design_diff` twice on an unchanged page reports the same `round`. `extensions/design/README.md` (Modify): the centre rule, calibration pool, the glyph refusal, `counts.paired`, the unchanged-page rule.

### Step 11: the live loop

The loop's clock is the save. Today every save already triggers a run (`watchSettled` in `loop.ts`: HMR update, debounce `runDebounceMs` 150, `page_hmr` settle, then `refresh` runs a full `design_diff` with `observe: false`), but a run on the stripe page costs 16 s, 14 of them the pixel compare, and every run re-pairs 199 nodes against 193 elements and recompares 4.6 Mpx from nothing. Saves come faster than runs, so the HMR run is always behind and the agent's own `design_diff` starts another. Ruling 25: a run after a single-file edit re-pairs and recompares only what the edit touched, keyed by content hashes the way git keys a commit; alternative K is reversed, re-pairing is the cost, not the moved component. Target: a run after a one-file edit on the stripe page under 2 s in `timings.total`.

64. `extensions/design/src/server/pair.ts`, `server/store.ts`, `shared/defs.ts` (Modify): a pair carries a `live` fingerprint `{source, tag, textHash, box}` next to its design node id (`PairsSchema`). `runVote` takes `carried: Pair[]` (the previous run's pairs for this target) and a `touched: Set<string>` of source files from the HMR diagnostics since that run; a carried pair whose design node still exists, whose live element still exists at the same source location with the same fingerprint, and whose source file is not in `touched` is taken before the greedy loop starts and its element leaves the pool; everything else is paired as today. On a run with no HMR diagnostics since the previous run (an agent `design_diff`, a `capture`) `touched` is every file, so nothing carries: the carry is only ever cheaper, never different. The pairs file gains `fingerprint` per entry; older files without it carry nothing.
65. `server/differ.ts` `comparePages`, `server/raster.ts` (Modify): the live capture is hashed per tile of `tileSide` 64 px (`tolerances.ts`); the mask, the per-box mismatch and the regions are computed only on tiles whose hash differs from the previous capture's, and the rest is copied from the previous run's stored tile results (`store.writeRun` gains `tiles-<run>.json`: tile hashes and per-tile mask bytes or mismatch). `mismatchAt` reads the tile cache. A run with no previous capture, or a capture of a different size, computes every tile.
66. `server/loop.ts` `watchSettled`, `server/differ.ts` (Modify): the bundler diagnostics' `file` list since the previous run is kept on the lane and handed to `runDiff` as `touched`; `design_diff` from the agent returns the latest settled HMR run when its capture hash equals the current page's (one capture, no compare, no pair: `repeatedRound` extended to observe runs against the latest `observe: false` run), and counts it as the round. `timings` gains `carried: {pairs, tiles}` so the brief and the x-ray show what was reused.
67. `it/test/design.it.test.ts` (Modify), `describe('live loop')`: on the `stripe` variant after a first full run, one edit to `stripe.css` (a card colour) then a `design_diff` reports `timings.total` under 2000, `timings.carried.pairs` at least 80 and `carried.tiles` at least 90 % of the page's tiles, and the same `counts.paired` as the full run; the edited card's colour delta is in the report; a `design_diff` with no HMR in between carries 0 pairs and 0 tiles and reports the same score as the carried run (carry never changes the answer). `extensions/design/README.md` (Modify): the carry, the tile cache, `timings.carried`.

### Step 12: a page that does not answer

Fourth stripe run (2026-11-03, step 11 build): the agent's first `design_diff` waited the full `measureTimeoutMs` and died with `timeout: design_measure: page did not reply (no widget connected?)`. Probed from outside the chat: the chat's session had a subscribed widget that did not answer a 3 s `page_hmr` ping, while another session's widget answered in 3 s. `makePageBus` (`core/src/page-bus.ts`) broadcasts an ask to every subscriber of the session, resolves on the first reply, and never learns that a subscriber is dead or throttled: a closed tab whose socket lingers, or a tab hidden for more than five minutes (Chromium then runs its timers once a minute and never runs `requestAnimationFrame`, so snapdom and the settle wait stall while the socket stays open and message events still arrive). Every page tool then costs its full timeout and reports a guess in parentheses.

68. `extensions/page/src/client` (Modify), the widget side: on every page request the widget first answers with its state when it cannot do the work: `document.visibilityState === 'hidden'` replies `{ok: false, error: {code: 'page-hidden', message: 'the page tab is hidden; bring it to the foreground'}}` at once (the socket message handler runs in a hidden tab, timers and frames do not); a request whose handler throws replies with the thrown error instead of staying silent (check every client tool handler is wrapped). The widget answers a `page_ping` request (new, hidden tool) with `{visibility, route, width, since: <ms since the last frame>}` without touching timers or frames.
69. `core/src/page-bus.ts` (Modify): `ask` pings every subscriber with a 1 s budget before a request whose timeout is above 5 s, sends the request only to the subscribers that answered the ping and are not hidden, and when none did, throws `no-live-widget` with the count of subscribers, how many were hidden and how many silent, so the tool error reads `no widget answered on session …: 1 hidden, 1 silent` instead of a guess. A subscriber silent on three pings in a row is unsubscribed. `connected` reports live subscribers only.
70. `extensions/design/src/server.ts`, `server/differ.ts` (Modify): a run whose measure fails with `page-hidden` or `no-live-widget` is not a run: no result file, `round` unchanged, the tool returns `{hint: 'the page tab is hidden; bring it to the foreground and run design_diff again', partial: true}` within 2 s. `design_status.next` carries the same line while the page is hidden.
71. `it/test/design.it.test.ts` (Modify), `describe('page')`: with the page tab hidden (Playwright: open a second page and bring it to the front, or `page.evaluate` overriding `document.visibilityState` through `Object.defineProperty` plus a dispatched `visibilitychange`) a `design_diff` returns within 2 s with the hidden hint and no new result file; with a second widget subscribed on the same session whose socket is held open but never replies (the page-plane testkit can open a raw socket), a `design_diff` still completes through the live widget and `timings.total` is under the full run plus 2 s. `core` unit: the bus unsubscribes a subscriber after three silent pings. `extensions/design/README.md` and `core/src/api/README.md` (Modify): the ping, the hidden rule, the error wording.

### Step 13: the fourth stripe run

Fourth run (2026-11-03, step 11 build, the agent's page in flow layout, the chat widget in the user's tab): unbuilt 199 → 61 → 36 → 66 → 22, paired 138 → 163 → 133 → 177, mismatch 24.3 → 21.6 → 22.7 → 21.6 %, and `stop: oscillating` at round 3 held through round 4, the best round of the run, so the agent quit with four rounds left. Carry: 0 pairs on rounds 2 and 3 (every edit touched `Landing.tsx`, the whole page), 50 on round 4 (a css-only edit); 180 to 408 of 1140 tiles. Per round 27 to 77 s in the user's tab, compare 20 to 49 s, and 10 to 25 s outside measure, compare and pair. The brief carried "build a row of 3 texts under the box: gaps around 235", "build the box (fixed) as the 112th item in the stack on the page" and five "replace the hard-coded sample "$5.46"" lines on a page whose numbers are its copy.

72. `extensions/design/src/server/loop.ts` `oscillating`, `stopReason` (Modify): today one item whose value went A → B → A stops the run. The stop now reads the counted total of the stage: a round is a reversal when the total moved the opposite way from the previous round's move by more than the stage tolerance; `oscillating` needs two reversals in a row; a round whose total is the lowest of the run by more than the stage tolerance never stops and clears the reversal chain (a dip under the tolerance is noise, not a new best; step 15's glyph split moved a reversal round 0.87 under the best and would have hidden a third reversal). Items that flipped back are a brief line (`3 items moved back to their round-2 values: …`) and never a stop on their own.
73. `pair.ts` `carriedViews`, `differ.ts` (Modify): `touched` no longer excludes a pair; a carried pair is taken whenever its design node exists and a live element with the same fingerprint (source line, tag, text hash, box within `tileMargin`) exists, whatever file changed; `touched` only orders the candidate scan. On a one-file page an edit that moves nothing else carries everything else. `timings.carried.pairs` on the stripe variant after a one-line text edit in `Stripe.tsx`: at least 80.
74. `differ.ts`, `shared/defs.ts` `TimingsSchema` (Modify): timings cover every phase: `capture`, `decode`, `measure`, `mask`, `regions`, `pair`, `typography`, `deltas`, `judge`, `encode`, `write`, `total`, each a whole ms, zeros for phases skipped. The step then removes the two largest phases outside measure and pair on a headless stripe run after a css edit, measured first and named in the report; the expected ones are the png encode of the live and diff images at 3600 px on the main thread (encode once, off the request path, after the report returns) and a compare that still scans every pixel of the raster to build the mask before the tile cache is consulted. Target for this step: `total` under 10 s on that run; the 2 s target of step 11 stays open.
75. `loop.ts` sentences, `differ.ts` text verdicts (Modify): a run or node with no named parent is anchored to the nearest design text above it (`under "financial tools — designed to work…"`), never to `the box` alone, and an ordinal above `ordinalLimit` 9 is replaced by that anchor (`near "Daybreak Yoga"`). The `sample-data` warning fires only when the paired element sits in a container that renders at least one sibling from an expression (provenance: a live text with no literal in its JSX source line) or when the design node carries a role mark; a page with only literal copy gets no sample-data line at all.
76. `it/test/design.it.test.ts` (Modify), `describe('loop')` and `describe('live loop')` on the `stripe` variant: two css edits that move the card row down then back produce no `oscillating` on the round that returns to the best total; a third reversal does; a one-line text edit in `Stripe.tsx` carries at least 80 pairs; no brief line on stripe contains `the box:`, `the box (`, an ordinal above 9 or `hard-coded sample`; `timings` on the stripe run after a css edit has `total` under 10000 and every phase present. `extensions/design/README.md` (Modify): the stop rule, the fingerprint carry, the timings table, the anchor rule, the sample-data gate.

### Step 14: the node ledger

The fourth run's reports answered "how far is the page from the design" and never "what did my last edit do". Each round re-derived every pair from nothing the carry could not prove, listed the same 110 unbuilt nodes in a new order, and gave the agent one 3600 px diff image to find its change in. The agent read `paired 133 → 177` as progress and `oscillating` as a verdict, and never learned that round 3 had broken 30 nodes round 2 had right. Ruling 26: the target keeps a ledger, one row per design node, that survives every run; a run reports its changes against the ledger the way `git status` reports a working tree against the index, and a node once paired keeps its element until the element is gone.

77. `extensions/design/src/server/store.ts`, `shared/defs.ts` (Modify): `ledger.json` per target, `LedgerSchema`: per design node id `{status, since, pair, item}` where `status` is `unbuilt | paired | done | regressed | accepted`, `since` the run name the status was reached in, `pair` the last known live pairing `{path, fingerprint, confidence, run}` or null, kept even when a later run lost the element, and `item` the node's worst current item `{stage, size, sentence}` or null. Status rules, applied by `runDiff` after `judge` on every run that becomes a round, a `design_diff` run or a settled run the next `design_diff` promotes (never on a repeated, partial or unanswered round; a save between rounds measures against the last round's ledger and writes nothing): `done` when paired and no item in any stage; `paired` when paired with at least one item; `unbuilt` when never paired; `regressed` when a node that was `done` or `accepted` has an item again or lost its pair; `accepted` when a decision `accept-node` exists for it (a new `DecisionsSchema` kind, set from the x-ray like a pin, cleared by the same gesture) and the run leaves it alone. A `regressed` node returns to `done` on the first run that measures it clean. `store` gains `ledger(id)` and `writeLedger`. A target registered before this step starts with every node `unbuilt`.
78. `server/differ.ts`, `server/loop.ts`, `shared/defs.ts` (Modify): `DiffReport` and the compact report gain `changes: {done, regressed, paired, lost, moved}`, each an array of `{node, sentence}` (the sentence anchored as item 75), computed as the ledger before the run against the ledger after it: `done` nodes newly clean, `regressed` nodes newly dirty or unpaired, `paired` nodes paired for the first time, `lost` nodes whose stored element is gone from the page (fingerprint source and text hash find nothing), `moved` nodes whose element is still there with its box outside `tileMargin` of the stored one. The brief's first line is the change summary (`since round 2: 12 done, 3 regressed ("Daybreak Yoga" lost its card…), 5 paired`); `regressed` items rank first inside the stage, before size. `design_status` gains `ledger: {unbuilt, paired, done, regressed, accepted}` and `changes` of the latest run. `counts` of the compact report gains `done` and `regressed`. The x-ray lists the ledger with the status per node and the change of the latest run.
79. `server/pair.ts` `carriedViews`, `server/differ.ts` (Modify): the carry reads the ledger's `pair` per node first, then the previous run's `pairs-<run>.json`; a ledger pair whose fingerprint still finds its element is taken before anything else, so a node paired in run 3 is paired to the same element in run 9 whatever the rounds between did, and a greedy take never re-decides a node the ledger holds. A ledger pair whose element is gone frees the node to the greedy loop and is recorded as `lost`; the ledger keeps the dead fingerprint until a new pair replaces it. On the stripe variant three consecutive runs with one css edit each report the same `path` for every node that is `done` after the first run.
80. `server/xray-routes.ts`, `src/xray` (Modify): `GET …/xray/node?target=<id>&node=<node>[&run=<run>]` answers a PNG with the design crop and the live crop of that node side by side, each the node's box grown by `tileMargin`, at the target's scale, encoded on request from `target.png` and `live-<run>.png` (never during a run). `changes.regressed`, `changes.moved` and the stage `rows` carry `crop` with that url, so the agent opens the node it is told about, not the whole diff. The compact report's `diffImage` stays.
81. `it/test/design.it.test.ts` (Modify), `describe('ledger')` on the `stripe` variant: after a full run `design_status.ledger.done + paired` equals `counts.paired` and `unbuilt` equals `counts.unbuilt`; a css edit that hides one card marks its nodes `regressed`, `changes.regressed` names them with a sentence and a `crop`, and the brief's first line starts with `since round`; restoring the card lists them under `changes.done` and the ledger reads `done` with `since` the new run; `changes.lost` is non-empty when the card's element is removed from `Stripe.tsx` and empty when only its colour changes; the `path` of every `done` node is identical across three css-edit runs; `GET xray/node` on a paired node returns `image/png` whose width is twice the node's box plus margins. `extensions/design/README.md` (Modify): the ledger, the statuses, `changes`, the crop route, the carry order.

82. `server/store.ts`, `server/target.ts`, `server/differ.ts`, `shared/defs.ts` (Modify): the fifth run's agent read `target.png` in eight slices before writing a line, because the brief names rows and gaps and never says what the three texts are, how large, which colour, or what the card holds, while `model.json` knows all of it and reaches nobody. Registration writes `design.txt` next to `model.json`: the design tree as an indented outline in document order, one line per node, `text "Access borderless" 56/700 #0a2540` for a text (folded text, size/weight, colour when known, role when known), `box 1280x72 row gap 29 align center padding 0 48, background #fff, border 1 #e3e8ee, radius 8` for a container or box (its layout from the layout pass, its paint), `image 480x320` for an image slot, children indented under their `within`. The outline is deterministic for the same model. The compact report and `design_status` carry `designPath`; `design_diff` with `full: true` carries `design: string[]` (the lines); `design_status.next` at round 0 says `read <designPath> for the whole design before building; the brief lists what to fix first`. The x-ray lists the file. `it/test/design.it.test.ts`, `describe('ledger')`: on the stripe variant `design.txt` exists after registration, has one line per model node plus the root, contains `"Access borderless"` with a size, and the `full: true` report's `design` equals the file's lines. README: the outline, one paragraph.

Seventh run (2026-11-03, step 14 build, opus): one-shot build paired 120 at round 2 with the brief `since round 1: 16 done, 104 paired`; the agent's next edit inserted lines in `Landing.tsx` and round 3 read `35 regressed, 63 paired, 80 lost, 24 moved` with structure 215 → 219, while 61 of the 80 "lost" nodes were paired in that very run and 29 of the 35 regressed had only swapped elements; round 4 read `68 regressed, 138 lost` and the agent went back to the render. Cause: a fingerprint's `source` is matched on file, line and column (`locationKey` in `pair.ts`), so an edit that shifts lines breaks every carried pair below it, the greedy loop reassigns, and the ledger reads the reassignment as loss. The compiler already visits every JSX opening element to stamp `data-conciv-source` (`extension-compiler/src/inject-source.ts`, oxc AST), so it can stamp an identity too. Ruling 29: a source line is an address for reading the site; the identity of an element across runs is a key the compiler derives from the element itself, not from where it sits in the file.

89. `extension-compiler/src/inject-source.ts` (Modify), `extensions/design/src/client.tsx`, `src/shared/defs.ts` `FingerprintSchema`, `server/pair.ts` `fingerprint`, `samePrint`, `server/ledger.ts` `sameElement`, `nearestSighting` (Modify): next to `data-conciv-source` the compiler stamps `data-conciv-key`, a short hash of the relative file, the name of the enclosing function or component (the nearest enclosing function declaration, arrow or method; empty at module level), the element name, its static `className` literal and its static text children, plus an ordinal among elements of the same hash in the file in source order. Inserting or moving unrelated lines leaves every key as it was; a mapped element yields one key for all its rendered copies, which the text hash and box still tell apart as today. The design client reads the key from the same element it reads the source from, and reads the element's owner path too: in React the fiber chain on the DOM node (`__reactFiber$…`): component names from the root down with each `key` prop and index in its parent, as `Landing > PricingCard[pro] > h3[0]`; in Solid the `data-vite-dev-id` owner the client already reads. `Fingerprint` gains `key: string | null` and `owner: string | null` (the protocol's `SourceLoc` is untouched). The owner path is the second identity: when the key changed (JSX moved to a new file or a component extracted) an element whose owner path, text and box match is still the same element, so a refactor does not reset the ledger. Two fingerprints name the same element when their keys are equal and non-null, their `textHash` matches and their boxes lie within `tileMargin`; with a null key (a page without the compiler's stamp) today's rule by file, line and column stays. `changes.lost` lists only nodes that have no pair in the run and whose stored element is not found by that rule; a node paired in the run is never `lost`. `changes.moved` compares the run's pair box with the stored box, outside `tileMargin`. A node whose pair changed element while it stays clean is `done`, not regressed. The stored `pair.fingerprint.source.line` is refreshed on every run that pairs the node. IT in `describe('ledger')`: on the stripe variant read one paired fingerprint's `key` from `pairs-<run>.json`, insert three lines at the top of `Stripe.tsx` through `rewrite` (an unused `const`), diff, and assert the key is unchanged while the line moved by three, `changes.lost` and `changes.regressed` are empty, `timings.carried.pairs` is at least the done count, and every `done` node keeps its path. `extension-compiler` IT: the stamped key is stable across a line insertion and differs between two sibling `<div className="a">` and `<div className="b">`. README: the key in the carry's fingerprint rule and one sentence in the ledger's "Changes".

### Step 15: icons are not text

Fifth stripe run (2026-11-03, step 13 build, one-shot page build from image slices): paired 145 of 199 in round 1 and 158 by round 3, structure 134 → 69, the css-only round carried 149 pairs and 1065 tiles at 7 s against 33 s, no false `oscillating`, anchored sentences, and the agent acted on every actionable item. The stage stayed `structure` for six rounds while geometry held 57 offsets and content about a thousand deltas the agent never saw, because the structure items that remained were unbuildable: 16 of the 178 text nodes are OCR readings of icons and glyph-sized marks (`血 US bank account`, `每 Daybreak Yoga`, `湖 Vital Flow`, `个`, `Q`, `X`, `K.`, single digits `0` `1` `2` `7` `9` at 7 to 42 px, confidence 0.61 to 1.0), and they topped the brief from round 3 on as `box near "血 US bank account"`, `text "9"`, `box with "éPay"`, next to unnamed `box (fixed)` items that are the icons' own boxes. Round 5 regressed paired 159 → 145 unseen (step 14 covers that). Ruling 27: an OCR line that is not a word of the design's script is an icon, not text; an icon is a slot the agent fills at will and never blocks a stage.

83. `extensions/design/src/server/target.ts` `textEnricher`, `textNode` (Modify), `shared/tolerances.ts` (Modify, `iconSide` 24, `iconTextFloor` 0.8): after the OCR lines are read and before they become text nodes, each line is split into glyphs and words. A glyph is a leading or trailing run of the line that is one or two characters long and is either outside the design's script (a code point above U+024F when at least nine in ten of the design's characters are Latin; the design's script is the majority script of all lines), or a single character whose ink box is under `iconSide` on both sides, or read with confidence under `iconTextFloor` while under three characters. A glyph becomes an `image` node on its ink box; the rest of the line stays a text node on its trimmed box (`血 US bank account` becomes an image at the glyph and the text `US bank account`). A line that is nothing but glyphs becomes one image node. Lines of digits two or more characters long with confidence at or above `iconTextFloor` stay text (prices, counts). `design.txt` writes an image node under `iconSlotSide` as `icon 24x24`.
84. `extensions/design/src/server/target.ts` (the box pass) (Modify), `shared/tolerances.ts` (Modify, `iconSlotSide` 48): a segmented box with no text child, no box child and both sides under `iconSlotSide` is an image node, not a box; the fifth run's unnamed `box (fixed)` items are these. `server/loop.ts` `itemsFrom` (Modify): an unmatched entry whose node is an image node under `iconSlotSide` on both sides is an icon slot and produces no item, so no brief line, no score weight and no hold on the stage; the compact report's `counts` gains `icons` (icon slots the run did not pair) and the ledger keeps them `unbuilt` (the status is true; it holds nothing). The x-ray lists icon slots in their rows as today. `extra` entries whose live element is under `iconSlotSide` on both sides and sits inside a paired node's box are dropped the same way (an icon the agent built where the design has one).
85. `it/test/design.it.test.ts`, `describe('icons')` on the stripe variant: after registration no text node holds a code point above U+024F; no text node is a single character under `iconSide`; the model holds at least three image nodes under `iconSlotSide`; `design.txt` holds an `icon` line; the round-0 brief has no line naming an icon slot (no `icon`, no quoted one-character text); `counts.icons` is at least three on the registration run and at least one lower after the agent-side fixture renders an icon inside a paired card (one `<span class="icon" />` of 20 px added by `rewrite` to `Stripe.tsx` in the lilac card and restored in `finally`). README: icons, one paragraph in the segmentation section and the `icons` count in the compact-field list.

Seventh run, the stop: round 7 ended `stalled: 348 items unchanged for 2 rounds` while the structure total fell 138 → 121 in that very round, and the items it named were `change the text from Contact sales › to Contact sales >` and `Products ⌄ to Products`: the OCR read `›` as `>` and dropped a chevron glyph, the agent's text was right. Ruling 30: a stall is a round in which the agent edited and the stage's total did not move; items it does not work on are not a stall, and a text that differs from the design only in confusable punctuation matches.

90. `extensions/design/src/server/loop.ts` `stalled`, `stopReason`, `stalledLine` (Modify): `stalled` reads the counted total of the current stage, like `oscillating` since item 72: the run stalls when the stage total moved by less than the stage tolerance for `stallRounds` rounds in a row with a capture change each round. The unchanged-items count leaves the stop rule and stays a brief line only when the stop is `stalled` (`stalled: the structure total held at 121 for 2 rounds; 348 items unchanged, first: …`). The demotion of unchanged items (`unchangedLately`) is untouched. IT: the existing stalled cases keep their stops (an unchanged page edited outside every box moves no total); add one case where a css edit moves the structure total each round for three rounds and the stop is never `stalled`.
91. `extensions/design/src/server/differ.ts` (the text verdict), `shared/tolerances.ts` (Modify, `CONFUSABLES`): before two texts are compared, both are folded through a confusables map: `›` `>` `»` to `>`, `‹` `<` to `<`, `—` `–` `-` to `-`, curly quotes to straight, `…` to `...`, `×` to `x`, and a trailing or leading single glyph outside the design's script (a chevron, an arrow, a check) dropped on both sides; a text delta is counted only when the folded strings differ. The brief sentence keeps the raw texts. IT: a fixture text `Contact sales ›` against an OCR line `Contact sales >` yields no content item (unit-level through the stripe variant: edit the fixture's `Contact sales >` to `›` through `rewrite` and assert no content item names it).

Seventh run, the pictures: the agent drew the hero illustration, the card icons and the logos as inline SVG paths and CSS shapes guessed from the image; every one is wrong and the pixel compare counts every one. Ruling 31: with an image adapter the agent never draws an icon, logo or illustration; every image node and icon slot takes a placeholder, the tool hands it the placeholder, flags an SVG it drew anyway, and masks picture boxes in the compare. A gradient is paint, not a picture: the model reads its two ends and the agent writes CSS.

92. `extensions/design/src/server/store.ts`, `server/target.ts`, `shared/defs.ts` `DESIGN_GUIDE` (Modify): registration writes `placeholder.tsx` next to `design.txt`: one framework-matched component (`React` when the page reports fibers, `Solid` when it reports the vite dev id; React when unknown) named `Placeholder` with props `kind: 'icon' | 'logo' | 'image' | 'avatar'`, optional `label`, filling its parent's box (`width: 100%; height: 100%` with `aspect-ratio` from the slot when the parent has no height), a neutral look that cannot look broken: rounded rectangle, two-tone soft fill derived from a hash of `label`, a small centred glyph per kind drawn with CSS, `aria-hidden`. `design.txt` writes `image 480x320 placeholder` and `icon 24x24 placeholder`; `design_status.next` at round 0 adds `copy <placeholderPath> into the page's source and use <Placeholder kind=…> for every image and icon line`; `designPath` gets a sibling `placeholderPath` in the compact report and `design_status`. `DESIGN_GUIDE` gains: `Never draw icons, logos or illustrations: no inline <svg> paths, no data urls, no CSS shapes copied from the image; every image and icon slot takes the Placeholder. Gradients are CSS.`
93. `extensions/design/src/client.tsx` (measure), `server/differ.ts`, `shared/defs.ts` warnings (Modify): the measure reports, per component, `drawn: boolean` when the element is an `<svg>` with path, polygon or circle children, an `<img>` whose `src` is a `data:` url, or a `<canvas>`. A drawn element that pairs with or lies inside an image node or icon slot raises the warning `svg-drawn` with its source (`h3 (src/Landing.tsx:120): drawn svg; replace it with <Placeholder kind="icon" />`), listed in the brief before the stage items. Image nodes and icon slots are masked in the pixel compare the way `image-slot` decisions are today (`paintOver` with the design's box), so a placeholder costs nothing and a drawn picture costs nothing either, only the warning. `counts` gains `drawn`.
94. `extensions/design/src/server/target.ts` (the paint pass), `shared/defs.ts` box paint, `server/store.ts` `designOutline`, `server/differ.ts` paint deltas (Modify): a box whose fill changes along one axis by more than the colour tolerance and is smooth (each row's or column's mean colour differs from its neighbour by less than the tolerance) is a gradient: `paint.gradient: {from, to, axis: 'vertical' | 'horizontal'}` with the two end colours; `design.txt` writes `background gradient #635bff to #00d4ff vertical`. The measure reads `background-image`; the paint delta on a gradient box compares the two live stop colours (first and last stop of the first `linear-gradient`) with the design's ends, and a solid live fill against a gradient design is one `background` delta naming both ends. A box with a non-smooth varying fill is a picture, not a gradient, and becomes an image node.
95. `it/test/design.it.test.ts`, `describe('icons')` (Modify): `placeholder.tsx` exists after registration and compiles when copied into the fixture (`rewrite` copies it in, the page renders a `<Placeholder kind="icon" />` in the lilac card, and the next diff has no `svg-drawn` warning); an inline `<svg><path/></svg>` added in the same place raises exactly one `svg-drawn` warning naming `Stripe.tsx`; the pixel `mismatch` does not change when the placeholder is swapped for the svg (masked); the stripe variant's hero box reports a `gradient` with two ends in `design.txt`. `extensions/design/README.md`: placeholders, drawn pictures, gradients, one paragraph each.

96. `packages/it/scripts/design-trial.ts` (Modify, `--blind`): the trial's agent runs without pixels. With the flag the chat system prompt lists no `page_screenshot`, and the compact report and `design_status` the agent receives have `livePath`, `diffImage` and `capturePath` removed (the x-ray and the store keep them); the prompt file gains the line `Never open a png or take a screenshot; the tool's numbers are the only view of the page you have.` Every thesis run from the eighth on uses `--blind`; the stripe fixture is removed from the demo worktree's host `src` before a run so the agent has no built stripe page to copy from.

### Step 16: sections, so agents can split the page

Sixth and seventh stripe runs (2026-11-03, step 14 build): the agent read `design.txt`, cropped the image into three slices for sizes and colours the outline did not have at round 0, and wrote the whole 3600 px page in one file before the first diff, because the prompt says "build the page", the outline is one flat tree and the brief is the top five items of the whole page. The pairing is whole-page and stays so: one measure, one carry, one ledger. What an agent needs is a slice of its output. Ruling 28: a section is a top-level box of the design tree; a `design_diff` scoped to a section reports only that section's items, changes and counts, so several agents can each build one section in parallel against the same target, and the orchestration (one agent per section, a page skeleton written first) is the harness's business, not the extension's.

86. `extensions/design/src/server/store.ts` `designOutline`, `shared/defs.ts` (Modify): every top-level node of the outline (a child of the root) is a section. Its line starts with `section <id>` (the node id) before the node line, as in `section 4f1c2a7e box 1280x72 row gap 29 align center, background #fff`; nested lines stay as they are. The type estimate that rewrites the outline keeps the ids (they are the node ids). `design_status` gains `sections: [{id, kind, line, ledger}]` in document order, `line` the outline line without the `section` prefix, `ledger` that section's `LedgerCounts` over its subtree. A text node at the top level is its own section (the nav words of the stripe design are top-level texts today; the layout pass may later group them).
87. `shared/defs.ts` `DiffInput`, `server/differ.ts` `runDiff`, `server/loop.ts` `judge` (Modify): `design_diff` takes `section?: string` (a section id). The run is the whole-page run as today, written to the store as today; with `section`, the returned report filters to the subtree: `items` whose node is in the subtree (an unmatched or delta item with no node is kept only when its box lies inside the section's box), `rows`, `brief`, `stage`, `score` and `stop` computed over those items, `changes` filtered to subtree nodes, `counts` and `ledger` over the subtree, `unmatched` and `components` filtered the same way, and `section: {id, line}` echoed. The round, budget, history and ledger are whole-page and unchanged by the scope. A `stalled` or `oscillating` stop is whole-page too (it reads the rounds); a scoped report says `done` for the section when the subtree has no item above tolerance, as `stop: 'done'` with `scope: 'section'`, and the whole-page `stop` is in `page: {stop, stage, score}`. `design_status` with `section` filters the same way. An unknown section id is an error naming the known ids.
88. `it/test/design.it.test.ts`, `describe('sections')` on the stripe variant: `design_status.sections` lists at least four sections in document order with ids that appear in `design.txt`; `design_diff({section})` on the hero section returns items whose nodes are all within that section, a `brief` shorter than the whole-page one, and `page.stop` equal to the whole-page `stop`; hiding the lilac card by css and diffing with the card's section returns `changes.regressed` with the card's nodes while the hero section's scoped diff returns none; an unknown id throws an error listing the known ids. README: sections, one paragraph, and the `section` input in the tools list.

### Verification Plan

- **Build and static**: the gates above per step; `pnpm intent:validate` and `check:refs` in `skills`.
- **Integration**: every existing case green as rewritten plus `nodes`, `loop`, sources, overlay and takumi cases. The five-rewrites case proves ruling 15; the `u1-390` case proves width never comes from the tab; the 1392 case proves `done` is reachable through the mirror; the `runBudgetMs` case bounds pairing cost.
- **Manual**: `pnpm trial` in `packages/it` against the pane in Chromium (Region Capture granted) and Firefox (snapdom); the three trial records under `docs/designs/trials/`.

---

_Drafted with EGM_
