# Design critique (Stage 7) — design-driver.md, revision 2

Reviewer: egm-design (opus), feature-spec standard, lines 1–427. Read: spike records, the loop spike's `pairs.ts` and `round.ts`, design `server.ts`, `client/capture.ts`, `shared/types.ts`, `shared/tolerances.ts`, `extension-compiler/src/inject-source.ts`.

**Verdict: does not pass.** Form is met; the Risks & Limits bar is not. Several spike claims are wrong, and the identity, pairing and budget rules break on ordinary pages. No Risks and Mitigations section.

## Blockers

- **B1. Live identity collides for lists and shared components** (75, 197, 203, 205, 254). `data-conciv-source` is file:line:column of the JSX opening tag (`inject-source.ts`), so every `.map()` row and every element inside a shared `<Button>` shares one id. The loop spike appends `#${component.index}` (`pairs.ts:13`); the doc dropped it. CUJ 3's table and CUJ 7's grid cannot work. Fix: source plus occurrence index (or DOM path under the nearest unique source), and say how it stays stable when list length changes.
- **B2. Ids shift on every edit; the `pair-moved` rule does not exist** (197 vs 203). Adding a line above a component changes every id below it. Old pair rows stay unrevoked against dead ids; the unique index on `(target_id, node_id, width)` blocks the new id, so the node turns `unbuilt` and the component `extra`. Defeats Goal 32 and Alternative R. Fix: re-key orphaned pairs to the new id with same file, tag, text hash and overlapping box; collect pairs absent for N rounds.
- **B3. Text pairing needs equal strings, so text deltas never fire** (203 vs 213, CUJ 3). A differing label never pairs; it becomes `unbuilt` plus `extra`. A live expression rendering "Globex" leaves "Acme Corp" `unbuilt` and the structure brief asks the agent to build it: the hard-coded-sample trap. The spike falls back to best-IoU (`pairs.ts:64`). Fix: string first, else overlap or position; roles handled by the delta rule.
- **B4. Partial segmentation recall becomes structure work** (85 vs 32, 209, 233, 238). `extra` is a structure item and `unpairedShare` ranks first; the segmenter misses 50–86% of visible containers on real pages, so stage 1 never clears and the brief may tell the agent to remove correct components. Verification makes it worse (a differing component fails the template match and is `missing`). Fix: under `match`, a `present` component with no node is informational; `extra` counts as structure only under `build` or after user confirmation.
- **B5. Budget and stall count HMR saves, not agent iterations** (36, 217–221, 238–240). Budget 8 ends a `build` after about 8 saves; demotion hits every item a save did not touch; `oscillating` fires on edit then revert; a save that breaks compilation yields an all-`unbuilt` round that corrupts the history. Fix: count on `design_diff` reads; HMR rounds for x-ray freshness only; skip rounds while the bundler reports an error.
- **B6. `done` unreachable without a whole-page raster** (238, 240 vs 223). Residual is frozen at the registration raster; only `residual-only` or `budget` can fire unless the user clicks Capture. `tileGate` (per-tile fraction) reused as an area-share threshold. Fix: capture a whole page when every count reaches zero before deciding; define `residualAreaGate`.
- **B7. The x-ray writes source** (41 vs 42, 54, 112, 260, 270). Undo also races the agent's edits and the redo stack after a new edit is undefined. Git already covers rollback (61). Drop undo/redo of source; keep replay of target, pairs and decisions.

## Major

- **M1. Segmentation spike misstated** (85, 188, 376, 393, 401): Stripe is 14%/0%, not "half to two thirds"; truth set is visible containers only so misses are painted buttons, cards and bands, not invisible wrappers; 10–32 misses per real page, not three; `threshold-rgb-recurse-images` "recovered nothing" (results.md 320, 354); 0–3 spurious frames and up to 8 spurious images, not zero; 10–90ms is the loop share, real pages 357–1164ms (Guardian already trips the native-slot condition at 421); the spike's quality gate and Figma-export run dropped without a recorded reason.
- **M2. Typography evidence overstated** (31, 86, 189): thresholds 1.2/1.07 were derived on coverage, not density (density gives 1.22 for Inter 700, results 364); all cases macOS with the exact font installed, Figma and Linux untested; family out of scope means an Inter design against a system-ui page yields biased sizes and the brief asks for size changes to compensate; line-height caveat dropped; estimates run before pairing yet take the font from the paired component; under `build` there is no live body font.
- **M3. Live roles misfire on design-system components; default engine never covers CUJ 3** (35, 190, 213, 244): a label passed as a prop or through `t()` reads as `expression`, so wrong button labels never produce a text delta; the rule table lacks live `expression` against target `literal`, which is the default case with Jev off. State what the default config guarantees.
- **M4. Auto pairs never break and are least reliable early in `build`** (203). Keep `auto` pairs provisional until the structure stage clears.
- **M5. Carry and responsive scoring underspecified** (199, 205): no weights or normalisation behind 0.6/0.15; repeated rows tie and flood the engine; relative position is meaningless across a reflow; a breakpoint tag gives a width, the fix needs a media-query range.
- **M6. HMR, frame and capture assumptions** (76, 219, 223, 266): the hidden frame lives in the user's tab, so no tab means no round, and the page handle between tool calls is unspecified; settle signal comes from the tab; module graph source unspecified; playwright Chromium has no user session; paint re-checks only components whose file changed, so CSS, token and parent changes leave paint stale (`server.ts` already special-cases `.css`).
- **M7. "No agent can call them" is false** (41, 55, 270, 400): plain localhost HTTP, reachable by `curl` and by CSRF from any page. Require an origin check plus a per-session token, or reword as "not exposed as a tool".
- **M8. Replay and pruning conflict** (42, 112, 256, 262): runs pruned to 20 but replay promises any round; events never pruned so generated files grow the store; first-edit pre-image unspecified.
- **M9. Jev parts unverified or unhandled** (79, 240, 244): price not in the spike; no timeout or fallback; the residual `Noul` asks a text model about an unseen region. Drop that question.

## Nits

- 193: `typography.weight` already exists as `number` (`types.ts:19`); this is a type change needing migration.
- 254: `pairs.width` redundant (target row fixes width).
- 37 vs Alternative C vs 238, 256: stage "recomputed", "never stored", yet stored and history-dependent.
- 240: "compared stage by stage" undefined (lexicographic or any-component).
- 201, 233: `missing` vs `unbuilt` naming invites confusion; consider `not-in-design`.
- 174: a user-named dynamic route returns `candidates` but no outcome carries back a concrete URL.

## Scope

About ten subsystems in one design. Undo/redo of source, the residual engine question and cross-width grouping are speculative relative to the core loop. B1–B6 are the minimum to fix before the plan proceeds.
