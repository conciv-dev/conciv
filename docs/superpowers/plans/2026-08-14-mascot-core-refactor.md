# Mascot Core Implementation Plan (Phase 1 of 5) — v2 after codex review

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the framework-free compositional core of the approved spec (`docs/superpowers/specs/2026-08-14-mascot-componentization-design.md`) on a fresh branch, with independent pose/activity/follow controllers, one shipped effect (Binary), a `connect()` surface wrappers can mirror mechanically, and a temporary `createFabRobotRig` adapter keeping both consumers untouched.

**Architecture:** Greenfield structure, donor-verified values. Three independent controllers compose on shared part elements — pose (rest/awake expressions), follow (pointer tracking), activity (working overlay: antenna throb, eye blink, effect start/stop). `createMascot` owns lifecycle (unregistered → registered → destroyed) and config diffing. The donor branch (`feat/mascot-gaze`) supplies tuned constants, timeline values, and lifecycle guards as reference — never its three-exclusive-state machine.

**Tech Stack:** TypeScript strict, gsap, tsdown, vitest (node env, pure math only), Playwright behavior harness checked into the package.

## Global Constraints

- Repo style: zero comments, no classes, no IIFEs, no `any`/`as`/`@ts-ignore`, oxfmt (no semicolons, single quotes, 120 width).
- Branch: NEW `feat/mascot-component` off `origin/main`, fresh worktree. Donor `feat/mascot-gaze` (PR #486) is read-only reference; it is never merged and never edited by this plan. Task 0 copies spec + this plan onto the new branch as its first commit and opens a draft PR.
- Approved-production donor values (owner-approved via the playground picks; everything else in the stories is NOT approved): gaze falloff 220px / eye range 3px / quickTo 0.6s power3.out; antenna lean 10° / quickTo 0.5s power3.out; lean-wrapper isolation technique; throb timeline values (scaleY 1.3 / scaleX 0.88, beats 0/0.3/1.15/1.45, elastic.out(1,0.5)); blink values (scaleY 0.1 in 0.07s power2.in, back to pose eye scale in 0.18s power2.out at beats 1.15/1.22); binary emitter (5 digits, two lanes ±3px, 9px ui-monospace 700, rise −54px 2.2s stagger 0.42, color `var(--pw-accent, #e0218a)`, pre-set opacity 0 before timeline — donor commit `740e5d55` fix); tip fractions (0.5, 0.15625); enter back.out(2.2) 0.36s / exit power2.in 0.5s; pose values from donor `rig.ts` `setOpenPose`/`playOpen`/`playClose`; `measureEmitterRoom` math (donor `story-support.tsx`).
- Deferred OUT of phase 1 (explicit): curve styles / MotionPathPlugin / `CurveStyle` type (path-curve phase, after wrappers); the other 15 effects (phase 4); reduced-motion live re-evaluation (current product behavior — sampled at transitions — is kept; a media-query listener is a later enhancement and is NOT in scope).
- No new runtime dependencies. ONE new devDependency is pre-approved by the owner for this plan: `playwright` in `packages/mascot` at the exact version `packages/embed` pins, used only by the checked-in behavior harness.
- Package publish surface this phase: `exports` stays exactly `{".": {types: "./dist/rig.d.ts", import: "./dist/rig.js"}}`; `rig.ts` remains the single tsdown entry and re-exports the new core API (`createMascot`, types) alongside the legacy adapter. No package.json exports change. Gate: `pnpm turbo run publint attw --filter=@conciv/mascot` green. Subpath restructuring is phase 2.
- Gates before every commit: `pnpm exec fallow audit --format json --quiet --explain --gate-marker agent` (fix INTRODUCED). Task-end gate: `TURBO_CONCURRENCY=70% pnpm turbo run typecheck --filter=@conciv/mascot --filter=@conciv/app --filter=site`.
- Never `git stash`. Bash cwd resets between calls: pin absolute paths to the NEW worktree.

## Core design decisions (binding, from codex-review triage)

1. **Controllers, not a state machine.** `parts/pose.ts`, `parts/follow.ts`, `parts/activity.ts` are independent; each owns disjoint gsap property sets on the shared elements: pose owns head `yPercent/rotation/scaleX/scaleY`, eyes `scaleX/scaleY` (resting values), antenna `rotation/scaleX/scaleY` on the antenna element; follow owns eyes `x/y` and lean-wrapper `rotation`; activity owns antenna `scaleX/scaleY` pulses layered via its own timeline (started only when pose is settled — see matrix), eye blink `scaleY` excursions returning to the pose-defined value, and effect start/stop. Eyes `scaleY` and antenna `scaleX/scaleY` are NOT disjoint — they are HANDOFF channels, owned by pose while idle and by activity while working; the enforcement (added in the final fix wave) is that pose's `killTweensOf` narrows to the channels it owns during coexistence (head all four, eyes `scaleX` only, antenna `rotation` only) so a mid-work pose change cannot gut the running work timeline, while pose's own TWEENS still target its full donor set.
2. **state × working matrix** (all four cells defined; parity harness pins the three legacy ones):
   - rest+idle: rest pose; follow armed if `follow`.
   - rest+working: rest pose; throb+blink+effects; follow disarmed while working (arming rule below).
   - awake+idle: awake pose (perk-up animation on entry); follow armed if `follow`.
   - awake+working: awake pose retained; throb+blink+effects run from the awake pose (blink returns to awake eye scale 1.06); effects anchored at the awake antenna tip.
   - Follow arming rule: armed iff `follow && !working` (working owns the antenna scale channel and attention; the adapter reproduces legacy behavior with its table below).
3. **Effect ownership.** `createBinaryEmitter(stage, tip)` returns `{element, start(), stop(onRemoved), remove()}`; `stop` runs the staged exit and calls `onRemoved` after removal so the owner (activity controller) clears its reference in one place; `remove` is immediate teardown for destroy. Owner holds at most one reference; `start` while an exit is in flight kills the exit and re-enters (donor `startEmitter` guard semantics).
4. **Lifecycle.** `createMascot(initialConfig)` → service in `unregistered` state: `update()` only stores config. `registerParts({stage, head, eyes, antenna})` tears down any previous registration completely (destroy-equivalent, then re-setup: transform origins, lean wrapper, instant pose set from stored config — no entry animations on registration) and is therefore safe under React StrictMode/HMR re-attachment. IMPLEMENTED REFINEMENT: `registerParts` short-circuits when the incoming part set is identical to the current one (`samePartsAs` compares all five slots by identity) and returns without tearing down. That is the StrictMode-preferred behavior — a double-invoked ref callback re-passing the same nodes must not restart the emitter or re-wrap the antenna — and it is what the harness pins ("repeated registerParts keeps one lean wrapper / one listener"). A genuinely different part set still gets the full teardown-then-setup. `destroy()` → terminal: all controllers disposed, listener removed, emitter removed, lean wrapper unwrapped (`replaceWith`), further calls no-op.
5. **gsap ownership rule.** Every controller retains handles to every tween/timeline it creates and exposes `dispose()`; transitions kill-then-create through the owning controller only — no cross-controller `killTweensOf` by property string on shared elements except the documented pose/lean split (lean rotation lives on the wrapper element, pose rotation on the antenna element — donor technique). `destroy` = dispose all controllers, in order activity → follow → pose.
6. **connect() contract (framework-neutral).** `connect()` returns per-part getters: `getRootProps() / getHeadProps() / getEyesProps() / getAntennaProps() / getEffectHostProps()`, each `{style: Record<string, string>, ref: (el: HTMLElement | null) => void}` — style as a property record (spreadable in Solid; React wrappers convert keys where needed, documented in phase 2), ref as a per-part setter so wrappers register parts individually; core applies registration when all required parts are present (root+head+eyes+antenna) and tears down when any goes null. The phase-1 adapter does NOT use `connect()`; a harness check drives it directly so the contract is executable before phase 2.
7. **Reduced motion at boundaries.** Checked (`matchMedia`) at each transition exactly as the donor does: under reduce, poses set instantly, follow never arms, activity starts no timelines and no effects. No live listener (deferred, see Global Constraints).

---

### Task 0: Branch, worktree, docs seed

- [ ] **Step 1:** `git -C /Users/omrikatz/Public/web/aidx worktree add .claude/worktrees/mascot-component -b feat/mascot-component origin/main` (then `pnpm install` in the new worktree).
- [ ] **Step 2:** Copy `docs/superpowers/specs/2026-08-14-mascot-componentization-design.md` and `docs/superpowers/plans/2026-08-14-mascot-core-refactor.md` from `feat/mascot-gaze` (e.g. `git show feat/mascot-gaze:docs/... > docs/...`) into the new worktree, commit: `docs(mascot): componentization spec and phase-1 plan`.
- [ ] **Step 3:** Push and open draft PR titled `feat(mascot): componentized core (phase 1)`, body linking PR #486 as the prototype it replaces.

### Task 1: config.ts + path.ts with exact-value unit tests

**Files:**

- Create: `packages/mascot/src/core/config.ts` — types `MascotState = 'rest' | 'awake'`, `MascotConfig = {state: MascotState; working: boolean; follow: boolean}`, all approved constants from Global Constraints, `reduceMotion()`.
- Create: `packages/mascot/src/core/path.ts` — `measureEmitterRoom(anchor: {x: number; y: number}, bounds: {top: number; left: number; right: number}): {rise: number; bend: number}` — reimplemented to the donor algorithm (clamp rise to [8, 54] from headroom minus 12px margin; shortfall < 10px → bend 0; else bend = shortfall × 1.4 toward the roomier side, clamped to that side's room, sign = direction, tie → right).
- Create: `packages/mascot/test/path.test.ts`.

- [ ] **Step 1: Write the failing test** with EXACT precomputed values (from the algorithm above, no post-hoc adjustment):

```ts
import {describe, expect, it} from 'vitest'
import {measureEmitterRoom} from '../src/core/path.js'

describe('measureEmitterRoom', () => {
  it('full rise, no bend, ample headroom', () => {
    expect(measureEmitterRoom({x: 130, y: 100}, {top: 0, left: 0, right: 260})).toEqual({rise: 54, bend: 0})
  })
  it('squeezed top-left bends right by 1.4x the shortfall', () => {
    expect(measureEmitterRoom({x: 30, y: 28}, {top: 0, left: 0, right: 260})).toEqual({rise: 16, bend: 53.2})
  })
  it('squeezed top-right bends left', () => {
    expect(measureEmitterRoom({x: 230, y: 28}, {top: 0, left: 0, right: 260})).toEqual({rise: 16, bend: -53.2})
  })
  it('trivial squeeze stays straight', () => {
    expect(measureEmitterRoom({x: 130, y: 58}, {top: 0, left: 0, right: 260})).toEqual({rise: 46, bend: 0})
  })
})
```

Derivations, so the implementer can check the tests are right before running: headroom = y − top − 12; rise = clamp(headroom, 8, 54). y=100 → 88 → 54, shortfall 0. y=28 → 16, shortfall 38 → bend 38×1.4 = 53.2, left room = 30−12 = 18 < right room = 260−30−12 = 218 → +53.2 (clamped to 218, no-op). x=230 mirror → −53.2. y=58 → 46, shortfall 8 < 10 → 0.

- [ ] **Step 2:** Run `cd <worktree>/packages/mascot && pnpm exec vitest run test/path.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement both files. If any expected value disagrees with the implementation, re-derive by hand FIRST (the numbers above are the contract); only a derivation error in the plan justifies changing a test literal, and the change must be called out in the task report.
- [ ] **Step 4:** Test green; typecheck filter `@conciv/mascot` green.
- [ ] **Step 5:** Commit: `feat(mascot): core config and pure emitter-path math`.

### Task 2: parts/pose.ts

**Files:**

- Create: `packages/mascot/src/core/parts/pose.ts`

**Interfaces — Produces:**

```ts
export type PoseParts = {head: HTMLElement; eyes: HTMLElement; antenna: HTMLElement}
export type PoseController = {
  set: (state: MascotState) => void
  animateTo: (state: MascotState) => void
  eyeRestScaleY: () => number
  dispose: () => void
}
export function createPoseController(parts: PoseParts): PoseController
```

- [ ] **Step 1:** Implement from donor `rig.ts` (branch `feat/mascot-gaze`, symbols `setClosed`, `setOpenPose`, `playOpen`, `playClose`): `set('rest')` = clearProps transform on all three parts; `set('awake')` = the `setOpenPose` sets; `animateTo('awake')` = the `playOpen` timeline; `animateTo('rest')` = the `playClose` timeline (WITHOUT the donor's `startGaze()` tail call — arming is the service's job now). Retain the active timeline in a local; kill it before starting a new one; `dispose` kills it and clears transforms it owns. `eyeRestScaleY()` returns 1 for rest, 1.06 for awake — activity's blink return value.
- [ ] **Step 2:** Typecheck green. Commit folded into Task 5 if fallow flags unused; otherwise commit `feat(mascot): pose controller`.

### Task 3: parts/follow.ts

**Files:**

- Create: `packages/mascot/src/core/parts/follow.ts`

**Interfaces — Produces:**

```ts
export type FollowParts = {eyes: HTMLElement; leanWrapper: HTMLElement | undefined}
export type FollowController = {
  arm: () => void
  disarm: (animated: boolean) => void
  dispose: () => void
}
export function createFollowController(parts: FollowParts): FollowController
export function wrapForLean(antenna: HTMLElement): HTMLElement | undefined
```

- [ ] **Step 1:** Implement from donor `rig.ts` `startGaze`/`stopGaze`/`resetGaze`/`detachGaze`/`wrapForLean`: one window pointermove listener; shared falloff math (bounds from eyes element, `reach = min(1, d/220)`, `atan2`); eyes quickTo x/y (0.6s power3.out) × 3px; wrapper quickTo rotation (0.5s power3.out) × 10°; `arm` idempotent (listener-reference-is-the-state), respects `reduceMotion()`; `disarm(true)` = detach + 0.25s power2.out return to zero, `disarm(false)` = detach + instant zero; `dispose` = detach + kill.
- [ ] **Step 2:** Typecheck green. Commit policy as Task 2.

### Task 4: parts/activity.ts + effects/binary.ts + tip-transition.ts

**Files:**

- Create: `packages/mascot/src/core/tip-transition.ts` — `enterFromTip(element)` (fromTo scale 0.2→1, opacity 0→1, back.out(2.2), 0.36s), `exitIntoTip(element, onComplete)` (to scale 0.2 opacity 0, power2.in, 0.5s), both returning their tween.
- Create: `packages/mascot/src/core/effects/binary.ts` — decision 3's `createBinaryEmitter` with the approved digit/timeline values (including the `gsap.set(digits, {opacity: 0})` pre-timeline fix and straight −54px rise; NO curve support this phase).
- Create: `packages/mascot/src/core/parts/activity.ts`:

```ts
export type ActivityParts = {stage: HTMLElement; antenna: HTMLElement; eyes: HTMLElement}
export type ActivityController = {
  start: (eyeRestScaleY: number) => void
  stop: () => void
  dispose: () => void
}
export function createActivityController(parts: ActivityParts): ActivityController
```

- [ ] **Step 1:** Implement activity: `start` builds the throb+blink repeat timeline (approved beats; blink returns to the passed `eyeRestScaleY`) and starts the binary emitter (created lazily from `tipOffset(stage, antenna)` — tip-fraction math from config constants; skipped entirely under `reduceMotion()`); `stop` kills the timeline, returns antenna scale and eye scaleY to their pose values with short tweens (0.2s power2.out), and calls `emitter.stop(onRemoved → clear ref)`; `start` during an in-flight exit kills the exit and re-enters (decision 3). `dispose` = kill + `emitter.remove()`.
- [ ] **Step 2:** Typecheck green. Commit with Task 5 or standalone per fallow.

### Task 5: mascot.ts (service) + adapter in rig.ts + publish gates

**Files:**

- Create: `packages/mascot/src/core/mascot.ts`
- Create: `packages/mascot/src/rig.ts` (new branch's version): `export {robotLayers}`, legacy types, `createFabRobotRig` adapter, `export {createMascot}` + core types.

**Interfaces — Produces:**

```ts
export type MascotService = {
  update: (config: MascotConfig) => void
  registerParts: (parts: {stage: HTMLElement; head: HTMLElement; eyes: HTMLElement; antenna: HTMLElement}) => void
  connect: () => MascotConnect
  destroy: () => void
}
export function createMascot(initial: MascotConfig): MascotService
```

- [ ] **Step 1:** Implement per binding decisions 1-7: unregistered stores config; `registerParts` full-teardown-then-setup, instant pose from stored config, controllers created here; `update` diffs previous vs next and orders transitions: working rising edge → disarm follow (instant), activity.start; working falling edge → activity.stop, then arm follow if eligible; state change → pose.animateTo (activity keeps running across it when working — matrix cell 4); follow change → arm/disarm per rule `follow && !working`.
- [ ] **Step 2:** `connect()` per decision 6, including `getEffectHostProps()`; getters' style records carry the layer styling (position absolute, inset 0, layer data URI background, pixelated) from `robotLayers`. `contain` is DELIBERATELY OMITTED: any containment on the stage or the layers clips the binary emitter, whose digits rise 54px beyond the host box.
- [ ] **Step 3:** Adapter — exact translation table (decision + codex finding 5):

```ts
closed → {state: 'rest',  working: false, follow: true}
open   → {state: 'awake', working: false, follow: false}
work   → {state: 'rest',  working: true,  follow: false}
```

`createFabRobotRig({head, eyes, antenna})` derives stage as the layers' shared parent (donor `sharedParent`), creates service with the `closed` record, registers parts, maps `apply`, passes through `destroy`.

- [ ] **Step 4:** Gates: typecheck (mascot, @conciv/app, site), `pnpm lint`, `pnpm format:check`, mascot vitest, fallow audit, `pnpm turbo run publint attw --filter=@conciv/mascot`, dist grep: no `solid`/`react` strings.
- [ ] **Step 5:** Commit: `feat(mascot): compositional core with pose/follow/activity controllers and legacy adapter`.

### Task 6: Checked-in behavior harness + parity + consumers

**Files:**

- Create: `packages/mascot/harness/verify.mjs` + `packages/mascot/harness/page.html` — the donor scratch harness (`gaze/verify.mjs` pattern) rebuilt as a repository artifact: serves the built dist, drives Chromium via playwright, prints PASS/FAIL per check, exits non-zero on any FAIL.
- Modify: `packages/mascot/package.json` — devDep `playwright` (embed's exact version), script `"verify:behavior": "node harness/verify.mjs"` (not wired into turbo test — manual/agent gate; note this in the PR body).

**Checks (supersets the donor's 15):** legacy trio via the adapter — closed gaze (eyes ±3px, antenna ±10° with falloff ratio ≈ 0.5 at half distance), work (throb maxScaleY 1.3, 5 digits, staged enter, drain exit, flap ×5 → one emitter, no runaway tweens), open pose values; PLUS new-surface checks driven through `createMascot` directly: awake+working (awake pose retained while throbbing, blink returns to 1.06), update-before-registerParts (no throw, config applied on registration), repeated registerParts (no duplicate listeners/wrappers — assert one lean wrapper, pointermove count via instrumented addEventListener), destroy-during-exit (no dangling element), reduced-motion (all static, no emitter).

- [ ] **Step 1:** Build harness; run against `pnpm turbo run build --filter=@conciv/mascot` dist. All checks PASS.
- [ ] **Step 2:** Donor-parity spot check: run the SAME harness's legacy-trio section against the donor worktree's built dist (`/Users/omrikatz/Public/web/aidx/.claude/worktrees/agent-a7c0a33a7e8995ce3/packages/mascot/dist`) — both green proves parity without file swapping.
- [ ] **Step 3:** `pnpm turbo run build --filter=@conciv/embed`; grep bundle for `elastic.out(1, 0.5)` and `var(--pw-accent`; run widget typecheck trio again.
- [ ] **Step 4:** Commit: `test(mascot): checked-in behavior harness`; push; report full harness output verbatim in the PR + changeset `.changeset/mascot-core.md` (patch, describing the internal restructuring + new core API).

---

## Codex-review disposition (run 2026-08-14, gpt-5.6-sol, 15 findings)

Blockers 1-4: resolved by binding decisions 1-4 (compositional controllers + matrix; emitter `stop(onRemoved)` ownership; greenfield structure with donor-as-values-only; explicit lifecycle). Majors 5-12: adapter table now exact (Task 5); publish surface pinned + publint/attw gate (Global Constraints, Task 5); `connect()` framework-neutral records + per-part refs + effect-host getter (decision 6); gsap ownership rule (decision 5); MotionPathPlugin/curves explicitly deferred with the `CurveStyle` type removed from phase 1 (Global Constraints); reduced-motion boundary rule + harness check (decision 7, Task 6); harness checked into the package with a script (Task 6); state-machine/lifecycle tests added as harness checks incl. awake+working (Task 6). Minors 13-15: moot (no story-support edits on the new branch), exact test values precomputed with derivations (Task 1), donor policy tightened to an approved-values list (Global Constraints).
