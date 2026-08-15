# Mascot Phase 2 Plan (final phase, consolidated) — v2 after codex review, pending owner approval

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Everything after the core: core contract extensions (keyed effect hosts, per-part overrides), Solid + React compound wrappers mirroring `connect()`, both consumer migrations, curve support, the remaining 15 effects, the real-API story gallery, and deletion of the legacy `createFabRobotRig` surface. One phase, one branch, PR #486 closed at the end. Consolidated from the spec's phases 2–5 by owner decision (2026-08-14).

**Branch:** continues `feat/mascot-component` (PR #490) after phase 1's final review is clean, or stacked branch if #490 merges first — owner picks at kickoff.

**Authoritative upstream artifacts:** spec `docs/superpowers/specs/2026-08-14-mascot-componentization-design.md`; phase-1 plan (decisions 1–7 binding); donor branch `feat/mascot-gaze` (read-only: effect implementations in exploration stories, EmitterPath curve proof, `story-support.tsx`).

## Global constraints

- All phase-1 Global Constraints carry over: repo style (zero comments, no classes/IIFEs/any/as, oxfmt, cyclomatic ≤4), fallow gate per commit, typecheck trio, never stash, absolute worktree paths.
- New runtime deps: NONE. Manifest changes pre-approved for W1 ONLY: `solid-js`, `react`, `react-dom` as optional peerDependencies with `peerDependenciesMeta: {…: {optional: true}}`, matching workspace catalog version ranges; devDependencies for wrapper builds (`solid-js`, `react`, `react-dom`, `@types/react`) at catalog pins; tsdown `external` rules for `react`, `react-dom`, `solid-js` and their subpaths. Nothing else; anything more stops and asks.
- MotionPathPlugin (C1): imported as `gsap/MotionPathPlugin` (ESM build path verified against the installed gsap package layout BEFORE writing code), registered once inside `core/path.ts` module scope (idempotent — `gsap.registerPlugin` tolerates repeats), never in wrapper entries. `sideEffects` field in package.json updated to list the registering module only. Gate: SSR import test (`node -e "import('./dist/…')"` for core entry) + bundle-size delta of embed recorded in the task report.
- Publish surface AFTER this phase: exports `{".": compat entry (core + adapter until D1, core-only after), "./solid": …, "./react": …}` plus per-effect subpaths `"./effects/<name>"`. Transition rule (codex 5): `"."` keeps exporting the adapter until BOTH migrations (M1, M2) land; D1 flips `"."` to core-only atomically. Per-effect chunk isolation is proven, not assumed (codex 6): effects are explicit subpath entries (no barrel re-export of effects from wrapper indexes); gate = fixture bundle importing only Binary + module-graph/metafile assertion that no other effect module is reachable.
- Framework-isolation gates (codex 8, replaces naive dist grep): three packed-install fixtures under `e2e/` consumer-app pattern — core-only (no framework installed), solid-only, react-only; each installs the packed tarball with only its intended framework present and imports its subpath. Import success + runtime smoke = the gate. Dist greps kept as a cheap first-line check only.
- Wrapper fidelity rule: wrappers are MECHANICAL mirrors — no sequencing, no animation logic, no state beyond ref plumbing and context. Any temptation to sequence in a wrapper is a core defect: stop, fix core.
- Effects are moved, not rewritten: donor story implementations are the reference; each effect task names its donor file/symbols and its acceptance values (codex 11). Interiors stay FREE-FORM — the owner has explicitly rejected typed effect interfaces; conventions (staged enter/exit, flap idempotence, zero leaks, reduced-motion no-op) are held by review + harness checks, not types. Codex finding 3's "define a typed effect service contract" is REJECTED on that ground; what IS defined is host mechanics (CC0).
- Parity evidence: phase-1 harness grows check groups with every behavioral task; embed integration tests are the widget-level gate after M1.

## Core contract extensions (binding, new — resolves codex blockers 1–3)

1. **Keyed effect hosts (codex 2).** `connect().getEffectHostProps(id: string)` (spec's original signature). Core maintains a map id → host element; `registerParts` unchanged for the four structural parts. Effect mounting decouples from activity: `MascotService` gains `mountEffect(id, mount: (host: HTMLElement) => EffectHandle)` and `unmountEffect(id)`, where `EffectHandle = {start(): void, stop(onRemoved: () => void): void, remove(): void}` — exactly the shape Binary already returns, NOT a broader typed interface (interiors stay free-form; the handle is only what activity already requires to drive working transitions). Activity controller stops owning Binary construction: it drives every mounted handle's start/stop on working edges (start staged, stop drains; flapping idempotence preserved per-handle). Two mounted effect children = two live handles = two emitters — additive per spec. Default when no effect child mounted: NONE at core level; the WRAPPERS mount Binary by default (spec: bare `<Mascot>` renders the standard robot; widget default pick is Binary) — core stays policy-free.
2. **Per-part overrides, narrowed (codex 1).** Full child-level `state/working/follow` overrides require per-channel core config; the only override the spec's examples actually use is follow/animation on Antenna and curve on effects. Core config extends to `follow: boolean | {eyes: boolean, antenna: boolean}` (normalized internally; follow controller already drives eyes and wrapper independently — arm/disarm gains per-channel granularity). `state`/`working` remain GLOBAL-ONLY in v1 of the wrapper API: a child passing `state`/`working` is a type error, not a silent ignore. Wrapper context implements "child prop > context > default" ONLY for the channels core supports (follow per part, curve per effect, antenna `animation` preset when presets land — presets are OUT of this phase, they stay a spec-listed future). This narrowing is a deliberate API decision for owner sign-off at plan review.
3. **Slot semantics (codex 4).** No child-detection heuristics. Ark-style explicit slot registration: each part component registers itself in wrapper context on mount; the root renders default part elements for any slot with no registration (defaults render immediately; a registering child replaces its default on mount, restores on unmount). Fragments/conditionals/lists work because registration is a context effect, not a children scan. Same algorithm both wrappers.

## Open decisions (owner input required)

- **OD-1 (blocks C1 fan builder only):** fan curve style — owner pick, recorded with the chosen geometry + screenshot baseline BEFORE C1 starts (codex 20). Arc/hook/straight/auto proceed regardless.
- **OD-2 (decide by G1):** gallery composition. Default: one assembled Mascot story with state/working/follow/effect controls + one story per effect.
- **OD-3 (decide at plan review, blocks CC0):** approve the per-part override narrowing (core contract extension 2). Alternative if rejected: full per-channel config (bigger core rework, +1 task).

## Task graph (sequencing — codex 14)

CC0 → W1 → W2 → M1; W1 → W3 → M2; C1 (after CC0, parallel to wrappers) → E1…E15 (serial per-effect, batched commits); {M1, M2, E\*} → G1 → D1. No wrapper work before CC0 lands. E-tasks never touch wrapper index files (effects are subpath entries; wrapper effect-child files are created per-effect in the same E-task, additive files only).

### Task CC0: Core contract extensions

- Files: `core/mascot.ts` (keyed hosts, mountEffect/unmountEffect, follow normalization), `core/parts/activity.ts` (drive handles, stop owning Binary), `core/parts/follow.ts` (per-channel arm/disarm), `core/config.ts` (follow union type), `core/effects/binary.ts` (unchanged interior; construction moves to callers), harness: new check group (two effects mounted = two emitters, both drain on working falling edge; per-channel follow: eyes track while antenna still).
- The legacy adapter keeps exact current behavior: it mounts Binary itself with id `'binary'` at registration (parity with today).
- Also fixes here (phase-1 parked, if still open after phase-1 final review): pose/activity eyes-scale tween collision (matrix cell 4) — ownership-conformant resolution designed at dispatch time from the phase-1 ledger ruling.
- Gates: typecheck trio, vitest, fallow, harness full run (parity checks must stay green — this task must not change legacy-visible behavior).

### Task W1: Package restructure

- Files: `packages/mascot/package.json` (exports map with compat `"."`, subpaths, optional peers + peerDependenciesMeta, sideEffects), `tsdown.config.ts` (entries: compat rig, core index, solid index, react index, per-effect entries; externals), new `src/core/index.ts`.
- Gates: publint, attw, dist greps (first-line), packed-install fixtures core-only (solid/react fixtures activate in W2/W3), typecheck trio, fallow. `"."` still exports adapter — both consumers compile UNCHANGED (codex 5).

### Task W2: Solid wrapper

- Files: `src/solid/{use-mascot.ts, mascot-context.ts, mascot-root.tsx, mascot-eyes.tsx, mascot-antenna.tsx, mascot-binary.tsx, index.ts}` (effect children beyond Binary arrive with their E-tasks).
- Ark solid avatar as structural reference (reference-exact); slot registration per contract extension 3; splitProps only; refs through `connect()` per-part setters; root owns service creation/destroy on mount/cleanup.
- Prop/merge rules (codex 16 applied to both wrappers): consumer `style`/`class` merge AFTER core style record (consumer wins visually but a documented list of geometry-critical properties — position/inset/background — is asserted in the harness, not silently overridable); consumer ref and core ref both run (composed refs).
- Gates: typecheck trio, fallow, packed solid-only fixture, harness `solid-wrapper` group: mount, bare-`<Mascot>` full default render, part replacement + unmount-restores-default, working flap, conditional part churn (Solid `<Show>` toggling eyes), rapid mount/unmount ×5 (one lean wrapper, zero orphans), reordered children, two effect children = two emitters (codex 15).

### Task M1: Widget migration (Solid)

- Files: `apps/conciv/src/shell/fab-robot.tsx` → compound API (`state={open ? 'awake' : 'rest'} working={isStreaming() && !open} follow={!open}`, `<Mascot.Binary/>`).
- DOM/CSS contract preserved (codex 9): BEFORE coding, inventory current classes/structure the shell styles depend on (`.pw-fab-rig`, `.pw-rig-eyes`, busy-glow sibling selector, dimensions, aria-hidden) from the live source; the task carries that inventory as its acceptance list — classes land via wrapper class props, sibling structure asserted in the widget IT, glow behavior + FAB screenshot in the embed IT run.
- Gates: embed rebuild + widget integration tests (prebuilt bundle, newPage(), no networkidle), mount-externals test, bundle-size delta recorded, typecheck trio, fallow.

### Task W3: React wrapper

- Files: `src/react/` mirror (use-mascot, context, root, eyes, antenna, binary, index) with React idioms; ark react avatar reference; forwardRef with composed refs + merge rules as W2; style records converted to camelCase at the boundary.
- StrictMode gate (codex 15): harness `react-wrapper` group runs the mount under `<StrictMode>` — double-invoked effects/ref churn must yield exactly one lean wrapper, one listener, one emitter (registerParts teardown-then-setup already guarantees this at core level; the check pins it through the wrapper).
- Gates: typecheck trio, fallow, packed react-only fixture, harness react group (same checks as W2's plus StrictMode).

### Task M2: Site migration (React)

- Files: `apps/site/src/components/landing/robot-fab.tsx` → compound API INSIDE the existing button (the button, its handlers, delegated `onActivate`, dynamic labeling stay owned by the site component; Mascot replaces only the rig-layers span — codex 10). Behavior mapping written into the task brief from the current source before dispatch: hover → awake, click/pending → working, label transitions unchanged.
- Gates: site typecheck + build, focused site e2e covering hover/awake, click/working, delegated activation, label transitions, cleanup (codex 19 — unconditional, added if missing), fallow. Idle cost: harness asserts zero running tweens when rest+idle (site landing perf).

#### M1/M2 acceptance inventory — real layer boxes on both consumers (recorded 2026-08-15, phase-1 fix wave)

Recorded from the live sources so W2/W3 sizing and the M1/M2 acceptance lists are not guessed:

|               | widget (`apps/conciv`)                                                                  | site (`apps/site`)                                                                                  |
| ------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| stage element | `span.pw-fab-rig` inside the FAB `<button>`                                             | the `<button>` itself (`className="relative size-14 …"`)                                            |
| stage box     | 44×44px (`.pw-fab-rig` in `apps/conciv/src/styles.css`), sitting in a 52px pill button  | 56×56px (`size-14`), `position: relative`, `rounded-full`                                           |
| layer boxes   | `inset: 0` (`.pw-rig-layer`, `apps/conciv/src/styles.css`) → layers fill the 44px stage | `inset: 6` (`LAYER` in `robot-fab.tsx`) → layers are a 44×44px box inset 6px inside the 56px button |
| layer order   | head, antenna, eyes                                                                     | head, antenna, eyes                                                                                 |
| effect host   | none — emitter mounts into the stage                                                    | none — emitter mounts into the `<button>`                                                           |

Consequences the wrappers must honor:

- The lean wrapper cannot assume `inset: 0` on the antenna. Phase 1 fixed this by computing the wrapper's `transform-origin` in PIXELS from the antenna's own layout box (`antennaOriginOffset`, `core/tip-anchor.ts`) instead of the `'50% 32.8%'` string, which was measured against the wrapper's box and therefore landed 2px off the antenna base on the site. Wrappers must not reintroduce a percentage origin on the wrapper.
- The emitter tip anchor is likewise layout-box based and transform-aware (`antennaTipAnchor`), not `getBoundingClientRect`-based, so a rotated or scaled antenna does not inflate the anchor. A wrapper that inserts extra positioned elements between the antenna and the stage stays correct (the offset walk stops at the host).
- Core `ROOT_STYLE` (`core/layer-styles.ts`) is `{position: relative, display: block}` — it carries NO intrinsic size. A bare `<Mascot>` with no consumer sizing therefore collapses to 0×0. **Giving the root a default size is a W2 requirement**, and the W2 gate item "bare-`<Mascot>` full default render" is exactly this check.
- No `contain` and no `overflow: hidden` anywhere on the stage or layers: the binary digits rise 54px above the tip, well outside both host boxes.

### Task C1: Curve builders + auto resolution

- Files: `core/path.ts` grows builders (arc, hook, fan [OD-1], straight) + `'auto'`; MotionPathPlugin registration per Global Constraints; Binary honors `curve` config (default `straight`).
- Coordinate contract (codex 12), fixed here: all path geometry in STAGE-LOCAL coordinates (tip anchor already stage-local from `tipOffset`); room measured against the stage's `getBoundingClientRect` intersected with the viewport, converted to stage-local before `measureEmitterRoom`; recompute on every emitter `start()` (matches donor: measured per start, not live on scroll/resize — donor parity, documented limitation); lanes ride the rotated local frame (EmitterPath story technique, autoRotate + vertical tangent at tip).
- Unit tests: exact-literal geometry tests per builder (control points for ample/left-squeezed/right-squeezed/tie rooms, derivations in the brief); harness: screenshot anchor per style + near-edge cases (all four edges).
- Gates: vitest, typecheck trio, fallow, harness curve group.

### Tasks E1–E15: Port 15 effects (one per task, batched into 3 commit waves)

Per effect (codex 11): its OWN task brief naming the donor story file + symbols, classification (traveling honors `curve` / anchored ignores it), exact animation values carried, DOM/canvas cleanup rule, reduced-motion behavior (no mount), and harness checks (mount/start/drain/flap/unmount, leak scan). Files per effect: `core/effects/<name>.ts` + `solid/mascot-<name>.tsx` + `react/mascot-<name>.tsx` + tsdown entry + chunk-isolation fixture update. Waves for commit/gate economy: {Matrix, ThoughtCloud, PixelBubbles, SignalRings, SpeechBubble}, {Steam, Spark, SparkBurst, SparkFountain, Satellite}, {LedCone, TickRing, SignalBars, Heart, Notes} — each effect is its own subagent task + review; the wave shares one gate run.

### Task G1: Story gallery

- Real-API stories in the consolidated storybook app, importing PUBLISHED subpaths only (never source internals — codex 17); `story-support` shrinks to page chrome; `.fallowrc.json` donor-era ignores removed. Composition per OD-2.
- Gates: storybook vitest suite (never while a storybook dev server runs) AND `build-storybook` production compile (codex 17), fallow.

### Task D1: Deletion + release

- Delete `createFabRobotRig`, legacy types, compat entry (exports `"."` flips to core index), donor-era ignores; `rg` zero-reference gate for `createFabRobotRig|RigState|RigLayers|FabRobotRig` repo-wide and stale `robotLayers` consumers (codex 18); `packages/mascot/README.md` rewritten to the new API with subpath examples.
- Full sweep: repo-wide fallow 0 INTRODUCED, full typecheck/build/test, publint/attw, all three packed fixtures, embed ITs, site e2e.
- Changeset `.changeset/mascot-componentization.md` (patch line): core API + wrappers + effects + adapter removal.
- Close PR #486 with replacement link; final whole-branch review; owner merges.

## Codex-review disposition (run 2026-08-14, gpt-5.6-sol, 20 findings)

Blockers 1–3 → Core contract extensions section + Task CC0 (1: per-part overrides narrowed, OD-3; 2: keyed hosts + mountEffect, activity decoupled from Binary; 3: host mechanics defined, typed effect interface REJECTED per standing owner decision — free-form interiors, EffectHandle is only the pre-existing Binary shape). Majors: 4 → slot registration (extension 3); 5 → compat `"."` until D1; 6 → effect subpath entries + module-graph fixture gate; 7 → W1 manifest enumeration + packed fixtures; 8 → packed-install fixtures as the real gate, greps demoted to first-line; 9 → M1 DOM/CSS inventory acceptance list; 10 → M2 button-ownership mapping; 11 → one task per effect with per-effect acceptance; 12 → C1 coordinate contract (stage-local, per-start recompute documented as donor parity); 13 → MotionPathPlugin global-constraint block (ESM path check, sideEffects, SSR import test, bundle delta); 14 → task graph resequenced (CC0 first, E-tasks additive-files-only); 15 → StrictMode/churn harness groups in W2/W3. Minors: 16 → merge rules in W2 (shared with W3); 17 → build-storybook + published-subpath imports in G1; 18 → rg gate + README in D1; 19 → unconditional site e2e in M2; 20 → OD-1 requires recorded geometry + baseline.

## Owner decisions + constraints (2026-08-15, resolves the open decisions)

- **OD-1 RESOLVED:** fan = donor EmitterPath geometry as-is; owner judges at that task's visual breakpoint; retune only on rejection.
- **OD-2 RESOLVED (superseded by story-per-task):** the gallery is not a trailing task. Every task that adds something visible ships its storybook story (+ docs page + storybook interaction test) IN THE SAME TASK. Stories are core-driven (storybook needs only a DOM node; no wrappers required) — the entire visual gallery is independent of wrapper progress. Wrapper stories cover only wrapper-specific behavior (slots, defaults, StrictMode) and land with W2/W3. G1 shrinks to gallery assembly/polish + docs index.
- **OD-3 RESOLVED:** narrowed overrides approved (follow per part, curve per effect; state/working global-only, child passing them = type error).
- **Head bob RESTORED:** CC0 gives activity a working-time head channel (donor values: yPercent −5, sine.inOut, yoyo) using the same handoff pattern as eyes/antenna; pose owns head when idle. The playwright suite gains the bob check; the phase-1 changeset note about the dropped bob gets updated when this lands.
- **Behavior checks in CI:** phase-1 branch converts them to a standard `/test` suite wired into the package test script; phase-2 tasks extend that same suite (per-task check groups already specified).
- **Human visual breakpoints (HARD):** every milestone with visible output (CC0 head bob, each effect wave, curves, wrappers-in-widget, site migration, gallery) ends with a runnable thing + one-line look-at checklist + owner sign-off before the next milestone builds on it.
- **Skinnable mascot (design constraint, no feature now):** future per-harness mascots (Claude Code logo when claude selected; Codex/Pi likewise). CC0/W1 must isolate all art-specific values behind one optional `skin` value — layer images (robotLayers data URIs), transform origins, origin fractions, tip fractions, awake eye scale — defaulting to the robot. Controllers/service stay art-agnostic (they already animate generic elements); connect() style records read from the skin. Alternate skins later become data, not code.
- **Wrapper note (from fix-wave re-review):** wrappers must bind the effect host BEFORE or WITH the four structural part refs — binding it last forces a teardown/re-registration (samePartsAs compares effectHost).
