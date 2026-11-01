# Intermediate zoom-out report (Stage 8) — design-driver.md, revision 2

Reviewer: egm-zoom-out (opus), with all seven stage reports in view. Code checked: `matchers/tile.ts`, `comparators/edge-projection.ts`, `text-groups.ts`, `client/components.ts`, `server.ts`, `shared/types.ts`, `tool/steps/diff.ts`, `shared/defs.ts`, `harness-init/src/agent-guide.ts`, `packages/extension/src/tool-registry.ts`. Could not read the spike records: lines 83 and 409 say they sit beside the document, but `docs/designs/` holds only `design-driver.md` (they live in the session scratchpad). Spike-number findings (zoom_out M9, design M1, M2) left unruled.

## Verdict: changes required

The three problems need about a third of this design. Most Blockers come from three choices: rounds start on HMR, automatic pairs are stored, the store writes source. Reverse those three and about 25 findings go away.

## 1. Smallest shippable design

- Problem 1: replace the existing design bullet at `agent-guide.ts:20` (do not append); `design_target` with `intent` and closed outcomes (`ready`, `needs-route`, error); cascade user, manifest, ask; one round per `design_diff` with stage, brief, score before truncation, `round`, `budgetLeft`, `stop`; no capture by id (`diff.ts:71` already answers `route-mismatch`, the page extension has a navigate tool).
- Problem 2: flat node list (OCR text with render-search typography, threshold boxes with fill and radius, no hierarchy); pairing by extending the existing tile matcher (recomputed every diff) so each component also picks the overlapping target node; text pairing from `groupText` (`text-groups.ts:201`); live `expression` never a text delta, live literal against target `data` is a `sample-data` warning; target roles from character-class and bracket rules only, else `unknown`.
- Problem 3: decisions table (marks, `accept-delta`, user pins of a pair) keyed by route and width; runs with round and score, pruning spares first and accepted; acceptance as an x-ray HTTP route with an origin check; read-only timeline from `runs`.
- Cuts: no new dependencies (`p-queue`, `tinypool`, `@typesafe-ai/sdk`, `playwright-core`, `diff`); no `verify.ts`, `rounds.ts`, `edits.ts`, `model-cache.ts`, `captures/chromium.ts`, `pool.ts`, `engine/*`; no `events`, `cursor`, `target_elements`; no registry slots; no core API change. Carry, responsive grouping, Jev, undo wait for Step 8 trials.

## 2. Findings grouped by one structural change

- **G1 (Blocker). Round only on `design_diff`, whole-page raster each time.** Covers zoom_out B1, M8; design B5, B6, M6; comprehension 3, 8, 10; readiness B1, B2, M5, M6; codebase B1, M1, M2, M3, M12; structural M6. The tool request supplies the page handle; polling of `sourceChangedAt` suffices; budget counts agent iterations; residual stays current. Alternative M's rejection assumed a round per save.
- **G2 (Blocker). Recompute automatic pairs every round; store only user pins.** Covers design B1, B2, B3, M4; codebase B2, B3, M6; structural M7; readiness M3. `tile.ts:79-127` recomputes already, handles shared sources with `:nth-child` (`tile.ts:34-40`), and `edge-projection.ts:70-103` is the windowed fallback.
- **G3 (Blocker). Remove undo, redo, replay, edit events, cursor.** Covers zoom_out M2; comprehension 1, 6, 7; design B7, M8; structural B1; style 8, 9; readiness M7, M19. Non-Goals 54 and 61 already exclude it.
- **G4 (Major). Remove `match` verification.** Covers zoom_out M6, design B4 (verification half), structural M3, comprehension 11, readiness M12. `verify.ts` duplicates `comparators.geometry.estimate`.
- **G5 (Major). Remove the decision engine; rules plus `unknown` plus marks.** Covers zoom_out M3, design M3, M9, codebase N5, readiness B7. "Live `expression` is never a text delta" closes the sample-data trap without a role question.
- **G6 (Major). Remove registry slots, carry, `target_elements`.** Covers zoom_out M4, M5, design M5, readiness M8, M9. Breakpoint tagging exists (`breakpoints.ts`).
- **G7 (Major). `extra` is informational under `match`** (design B4).

## 3. Flips

Alternative M accepted; Alternative R accepted with amendment (recompute, store pins); Alternative H viable again (file store suffices once G2 and G3 apply; author chooses); Goals 42, 43 become Non-Goals; Goals 39, 44 become Future Improvements; Goal 41 trimmed to marks, `accept-delta`, acceptance; Goal 33 drops verification; line 179 drops forced `needs-route` on `build` and the model cache; section 1 step 3 defers the filesystem walker; section 9 dropped; `axis`, `columns`, `border` deferred.

## 4. Findings that are wrong or overreach

1. Own Stage 5 "keep pairs persistent and SQLite" withdrawn.
2. zoom_out M6's nearest-box fallback exists (`edge-projection.ts:70-103` via `tile.ts:52-63`).
3. Readiness B1 and codebase B1 need a core change only under HMR rounds.
4. Design B2's re-keying fix adds complexity; not storing auto pairs is smaller.
5. Design M2 "no body font under `build`" is wrong (the app shell loads); the family-bias limit stands.
6. Codebase M3, M12, M21, design M6, style 1 become moot under G1 and G5.
7. Readiness M1 and codebase B4 shrink: `:379-385` stays valid without capture by id; `:283`, `:325-327`, `:995-999`, `:274` still change.
8. Spike-number findings unchecked; two reports agree, treat as likely.

## New

- Major (83, 409): spike records not where the document says.
- Major (sections 3, 4; items 30, 31): fate of `tileMatcher` and `groupText` unstated; extend, do not duplicate.
- Nit (11): "the guide never mentions designs or images" is false (`agent-guide.ts:20`).
