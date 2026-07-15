# Animation improvement plans

Written by the `improve-animations` audit at commit `7fb70e7b` (2026-07-12). Each plan is self-contained: an executor needs no context beyond the plan file. Standards source: Emil Kowalski's animation philosophy (AUDIT.md / STANDARDS.md in the skill).

Statuses reconciled 2026-07-13 (post PR#54 `945901ba`, which executed the backlog): every plan landed at
least partially. PARTIAL remainders are listed under "Reconcile notes" below.

## Plans

| #   | Plan                                                                                           | Severity | Area                              | Status  |
| --- | ---------------------------------------------------------------------------------------------- | -------- | --------------------------------- | ------- |
| 001 | [Replace wind4 built-in entrance keyframes](001-entrance-keyframes-replace-wind4.md)           | HIGH     | uno-preset (all widget entrances) | DONE    |
| 002 | [Fix broken `anim-spin` class](002-fix-broken-anim-spin-class.md)                              | HIGH     | ui-kit-chat-tools                 | DONE    |
| 003 | [Wire panel & quick-terminal open/close](003-panel-quick-terminal-open-close.md)               | HIGH     | apps/conciv                       | DONE    |
| 004 | [Restore hydration suppression + tab-slide reset](004-session-switch-hydration-suppression.md) | HIGH     | apps/conciv + ui-kit-chat         | DONE    |
| 005 | [Highlight glide: token + transform](005-highlight-glide-transform.md)                         | HIGH     | apps/conciv                       | DONE    |
| 006 | [Mascot work→open tween + reduced-motion pose](006-mascot-work-open-transition.md)             | MEDIUM   | mascot                            | DONE    |
| 007 | [Toast transitions](007-toast-transitions.md)                                                  | MEDIUM   | ui-kit-system                     | DONE    |
| 008 | [page-mirror hygiene](008-page-mirror-hygiene.md)                                              | MEDIUM   | page (host-page overlays)         | DONE    |
| 009 | [FAB drag snap via transform](009-fab-drag-snap-transform.md)                                  | MEDIUM   | apps/conciv                       | DONE    |
| 010 | [ui-kit-system polish (press/popover/dialog/swap)](010-ui-kit-system-polish.md)                | MEDIUM   | ui-kit-system                     | DONE    |
| 011 | [Chat surface motion (action bar, notices, chips)](011-chat-surface-motion.md)                 | MEDIUM   | ui-kit-chat + apps/conciv         | PARTIAL |
| 012 | [Chat package-level reduced motion](012-chat-package-reduced-motion.md)                        | MEDIUM   | ui-kit-chat + uno-preset          | DONE    |
| 013 | [Extensions pass (whiteboard/terminal/test-runner)](013-extensions-motion-pass.md)             | MEDIUM   | extensions                        | DONE    |
| 014 | [Site performance (idle loops, layout reads)](014-site-performance.md)                         | HIGH     | apps/site                         | PARTIAL |
| 015 | [Site reduced-motion + hover gates + dead CSS](015-site-reduced-motion.md)                     | HIGH     | apps/site                         | PARTIAL |
| 016 | [Site cohesion (tokens, stagger, frequency trims)](016-site-motion-cohesion.md)                | MEDIUM   | apps/site                         | PARTIAL |
| 017 | [Widget cohesion cleanup (LOW sweep)](017-widget-cohesion-cleanup.md)                          | LOW      | widget packages                   | PARTIAL |

## Reconcile notes (2026-07-13)

- **011** — everything landed except item 4: the permission-card entrance (`anim-msg-lg`) was deliberately
  backed out in PR#54 because its Pending story asserts `toBeVisible()` without `waitFor` and races the
  fade. Treat as settled unless the story gains a `waitFor` first.
- **014/015/016** — the vendored-component work was backed out of PR#54 (fallow complexity/duplication
  gates on `LogoLoop`, `SplitText`, `Magnet`, `VariableProximity`, demo, animated icons). Remaining:
  014 S2/S3/S4/S6, 015 A2/A3/A5/A6 (A6 half-done: glow gated, underline not), 016 K1-CSS/K8.
  Superseded by plan 032, which re-scopes the remainder with a fallow strategy.
- **017** — only E6 residual: `whiteboard/src/client/pins/thread.tsx:19` button still hover-snaps
  (no `trans-bg`); the plan's `FILE_HEAD`/`card.tsx:37` reference had drifted (no such constant).

## Follow-up plans (2026-07-13 re-audit, commit `3d9225ea`)

Written by the second `improve-animations` run after reconciling PR#54. Selection note: the user
had not yet confirmed which findings to plan; per the skill's non-interactive default these are
the top picks by leverage. Unplanned LOW findings (dialog enter/exit axis, SparkMark spring
damping, follow-up-chip stagger, tab-slide keyframe interruptibility, test-runner live-row
entrances, rail-collapse content fade, theme-toggle crossfade) are candidates for a future LOW
sweep.

| #   | Plan                                                                                  | Severity | Area                       | Status |
| --- | ------------------------------------------------------------------------------------- | -------- | -------------------------- | ------ |
| 032 | [Re-land backed-out site motion (fallow-safe)](032-site-vendored-motion-remainder.md) | HIGH     | apps/site + .fallowrc.json | TODO   |
| 033 | [Tooltip warm window](033-tooltip-warm-window.md)                                     | MEDIUM   | ui-kit-system              | TODO   |
| 034 | [Anchored origins + symmetric exits](034-anchored-origins-and-exits.md)               | MEDIUM   | ui-kit-chat + whiteboard   | TODO   |
| 035 | [Context-usage fill motion](035-context-usage-fill-motion.md)                         | LOW      | apps/conciv                | TODO   |

Order: independent of each other; 032 supersedes the remainders of 014/015/016 (do NOT also
execute those). 033/034/035 are widget-side and can land in any order; 034 step 1–2 are safe
one-liners if a smaller PR is wanted. Note for 032: the `.fallowrc.json` ignore is a repo-policy
change the maintainer must sign off on.

## Recommended execution order & dependencies

Widget track (one PR each, or batch 1+2 together):

1. **001** — root keyframe fix; changes how every widget entrance feels. Do first.
2. **002** — one-line broken-class fix; independent, trivially safe.
3. **010** — depends on 001 (`anim-pop` builds on `pw-fade-in-up`).
4. **004** — independent of 001 but verify feel after both (entrances now subtle AND suppressed on bulk mounts).
5. **003** — panel choreography; independent; largest feel change.
6. **011** → **012** — 012's shortcut gating covers classes 011 adds/removes; do 011 first.
7. **005, 006, 007, 008, 009** — independent of each other and of the above; any order.
8. **013** — after 001 (uses `anim-presence-in` semantics unchanged, but feel-check assumes new keyframes).
9. **017** — last in the widget track (sweep; avoids conflicts with earlier edits in the same files).

Site track (independent of the widget track entirely):

1. **014** — perf first (Magnet refactor lands the structure 015's gate hooks into).
2. **015** — reduced-motion/hover gates (Magnet gate coordinates with 014).
3. **016** — cohesion/tokens last (touches the same files; rebases cleanest at the end).

## Known-and-accepted (not planned)

- Ark collapsible height keyframes (`anim-collapse-*`): Zag constraint, deliberate.
- Widget blanket reduced-motion reset (`apps/conciv/src/styles.css:125`): documented tradeoff; plans 012/015 add component-level gates where the blanket doesn't reach.
- `--chat-ease` duplicating `--pw-ease`: package independence by design.
- Activity-rail width snap (`mirror-rail.tsx:158`): animating width thrashes xterm fit; revisit with a fit-on-transitionend spike.
- Excalidraw canvas visibility flip (`island.tsx:329`): light-DOM/hit-test risk; needs its own investigation.
- Example apps (`apps/examples/*`): boilerplate `transition: all` and missing reduced-motion — demo-grade, accepted.

Vetted and rejected by the 2026-07-13 re-audit (don't re-report):

- Mirror-rail `data-pw-hydrating` "dead code": NOT dead — consumed by `apps/conciv/src/styles.css:104`
  (`[data-pw-hydrating] [data-pw-msg] {animation: none}`); rail timeline items carry `data-pw-msg` via
  ui-kit-chat Activity and render inside the widget shadow tree where that stylesheet applies.
- Toast `height` transition (`ui-kit-system/src/toast.tsx:6`): plan 007's spec, sonner-style stack
  collapse; occasional surface, deliberate.
- `anim-rise` 320ms / `anim-fab` 360ms: first-appearance/rare moments, within the delight allowance.
- SparkMark & feature-card springs lacking a reduced-motion branch: covered —
  `apps/site/src/components/landing/lazy-motion.tsx:9` wraps the tree in `MotionConfig reducedMotion="user"`
  (imperative `useAnimate()` calls in the animated icons are NOT covered; that part stays a finding).

## Verifying a completed plan

Each plan has Mechanical + Feel check sections. Global gates before any PR: `pnpm typecheck && pnpm build && pnpm test`, `pnpm exec fallow audit --changed-since main --format json` (fix INTRODUCED findings), and the plan's own feel checks in a real browser.

---

# Codebase audit plans (018+)

Written by the `improve` deep audit at commit `70ab4e57` (2026-07-13), a separate pass from the animation backlog above. Eight parallel category audits (correctness, security, performance, tests, tech-debt, deps, dx/docs, direction); findings vetted by reading every cited file. These plans use the standard handoff-plan template (Status / Why / Current state / Steps / Done criteria / STOP conditions). Each is self-contained — an executor needs only the plan file and the repo.

## Execution order & status

| Plan | Title                                                                                    | Priority | Effort | Depends on | Status                                                                                     |
| ---- | ---------------------------------------------------------------------------------------- | -------- | ------ | ---------- | ------------------------------------------------------------------------------------------ |
| 018  | [Harden command auto-allow classifier + tests](018-harden-command-classifier.md)         | P1       | M      | —          | TODO                                                                                       |
| 019  | [conciv_open path containment](019-conciv-open-path-containment.md)                      | P1       | S      | —          | TODO                                                                                       |
| 020  | [Image temp files out of project cwd](020-image-temp-files-out-of-cwd.md)                | P1       | S      | —          | TODO                                                                                       |
| 021  | [CI gate apps + drop dead test:e2e](021-ci-gate-apps-and-e2e.md)                         | P1       | S      | —          | TODO                                                                                       |
| 022  | [Doc drift: hono / @conciv/embed / libSQL](022-doc-drift-widget-h3-jazz.md)              | P1       | S      | —          | DONE (webpack/rspack `@conciv/widget/global` lines left pending self-host bundle decision) |
| 023  | [Transcript snapshot parse cache](023-transcript-snapshot-caching.md)                    | P2       | L      | —          | TODO                                                                                       |
| 024  | [Single-pass, stable turn coalescing](024-single-pass-stable-turn-coalescing.md)         | P2       | M      | —          | TODO                                                                                       |
| 025  | [Lazy-load Excalidraw + xterm clients](025-lazy-extension-heavy-clients.md)              | P2       | M      | —          | TODO                                                                                       |
| 026  | [Lazy-load Shiki grammars/themes](026-lazy-shiki-grammars.md)                            | P2       | S      | —          | TODO                                                                                       |
| 027  | [Route conciv mutations through query layer](027-route-mutations-through-query-layer.md) | P2       | M      | 021        | TODO                                                                                       |
| 028  | [Decompose makeApp composition root](028-decompose-makeapp.md)                           | P2       | M      | —          | TODO                                                                                       |
| 029  | [Fix makeSend double-run release race](029-makesend-double-run-race.md)                  | P2       | S      | —          | TODO                                                                                       |
| 030  | [Mirror content-hash fingerprint](030-mirror-content-hash-fingerprint.md)                | P3       | S      | —          | TODO                                                                                       |
| 031  | [Persist minted session id reliably](031-persist-minted-session-id-reliably.md)          | P3       | S      | —          | TODO                                                                                       |

## Recommended order & dependency notes

1. **Security cluster first — 018, 019, 020.** Independent, HIGH-confidence, small-to-medium. 018 fixes the classifier _and_ ships its characterization tests in one plan (fixing the holes without the tests would let them silently reopen).
2. **Hygiene quick wins — 021, 022.** Independent. 021 (CI gate) may surface latent app failures; land it before/with 027 so `apps/conciv` work is protected. 022 is docs-only.
3. **027 depends on 021** — routing conciv mutations through the query layer should be protected by the CI gate that 021 adds.
4. **Perf — 023, 024, 025, 026.** All independent. 023 (server) and 024 (client) are the two halves of the chat-streaming O(n²) finding; either lands alone. 023 is the largest single item (L).
5. **Structural/correctness — 028, 029, 030, 031.** All independent. 028 is a pure refactor (green tests are the guard). 029/031 are small correctness fixes in `run.ts` — if both are taken, land them in either order but re-verify `run.ts` excerpts since they touch adjacent code.

## Findings considered and rejected / deferred (not planned)

Recorded so they aren't re-audited. These were real observations that did not become plans (either lower-leverage, or out of the selected clusters):

- **PERF-05 solid-streamdown full re-lex per chunk**, **PERF-06 per-chunk run-blob DB write**, **PERF-07 dist-only exports force `^build` before CI typecheck** — real perf items, deferred; 023/024 cover the highest-leverage streaming cost. Revisit PERF-07 if CI wall-clock becomes painful.
- **DEBT-02/04/05/06 characterization-test + complexity hotspots** (`claude/history.ts` parser, whiteboard `oxc-capture.ts` anchor visitor, composer `onKeyDown`, `page-action-card.tsx` 65-branch switch) — worthwhile "characterize then refactor" candidates; not in the selected clusters. DEBT-06 is a mechanical switch→lookup-table (S) if picked up later.
- **DEBT-07 harness registry hardcoded/eager** — built-ins registered via a static array in `packages/harness/src/registry.ts`; noted in plan 028's maintenance notes, not fixed there.
- **SECURITY-02 page-content prompt-injection boundary** and **SECURITY-04 CORS null-Origin allowed** and **SECURITY-05 terminal-WS no own-token** — real defensive-hardening design gaps (MED confidence); each needs a design decision (untrusted-content envelope; a boot-time capability token threaded through the embed client) rather than a mechanical fix. Good candidates for a dedicated hardening spike.
- **TESTS-06/07 low-coverage packages** (`packages/page` driver, `grab`, `solid-diffs`, `serve`) and **TESTS-08 contract-shape test** — coverage-expansion, not defect fixes.
- **DEPS-01 dead jazz-tools supply-chain residue** (S, HIGH confidence — inert overrides/excludes in `pnpm-workspace.yaml` + `.fallowrc.json`) and **DEPS-02 @types/node 26 vs Node 22 floor** (5 packages) — clean quick wins not in the selected clusters; easy follow-ups.
- **DOCS-04 nine published packages with no README**, **DX-03 no `.env.example`/site-deploy doc**, **DX-04 no watch/restart for core edits**, **DX-05 stray `engine2.log`**, **DX-06 no `EADDRINUSE` handler in `serve.ts`** — DX polish; DX-05 is a one-line delete.
- **Direction findings** (persistent tool-approval policy; finish/gate non-Vite bundlers; promote opencode/gemini-cli from "stub"; retire SPEC.md + cross-reload scrollback; whole-conversation export) — options for the maintainer, presented separately; each would be a design/spike plan if selected.

Verified sound (no finding): dependency stack is current, Solid singleton dedupes safely, `pnpm audit` clean, no committed secrets, layering intact (no cycles), 0% dead code, MCP/source-map/transcript paths are realpath-contained.
