# Mascot Core Refactor Implementation Plan (Phase 1 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `packages/mascot/src/rig.ts` into the framework-free core described in the approved spec (`docs/superpowers/specs/2026-08-14-mascot-componentization-design.md`), behind `createMascot` with a `connect()` prop-getter surface, with zero visual behavior change, while both consumers keep working through a temporary `createFabRobotRig` adapter.

**Architecture:** Pure code motion plus one new composition layer. Every animation, constant, and lifecycle guard currently in `rig.ts` moves verbatim into a focused core module; `createMascot` composes them driven by plain config (`state: 'rest' | 'awake'`, `working`, `follow`, `effects`); a thin `createFabRobotRig` adapter maps the old three-state API onto config updates so `apps/conciv` and `apps/site` need no changes in this phase (adapter dies in phase 5).

**Tech Stack:** TypeScript strict, gsap (+ MotionPathPlugin registered in core), tsdown, vitest (node env), Playwright harness for behavior parity.

## Global Constraints

- Repo style: zero comments, no classes, no IIFEs, no `any`/`as`/`@ts-ignore`, oxfmt (no semicolons, single quotes, 120 width).
- Package stays published: dist must contain no Solid/React references; `files: ["dist"]`; only `rig`-replacing entries added to tsdown config.
- No new dependencies. gsap is the only runtime dep.
- Behavior parity is the acceptance bar: the existing verify harness (scratchpad `gaze/verify.mjs`, 15 checks) must pass unchanged post-refactor.
- Branch strategy (owner decision 2026-08-14): implementation happens on a NEW branch `feat/mascot-component` cut from `main`, in a fresh worktree. `feat/mascot-gaze` (PR #486) is the DONOR branch — never merged, closed when the replacement lands. "Move verbatim" in tasks means: port the cited donor code deliberately into the new structure (logic and tuned values identical, imports/organization new); the parity harness is the referee. Exploration stories (`work-bubble`, `antenna-motion`, `antenna-art`, `work-combo`, `emitter-path`, `story-support`, `story-bubble-effects`) are NOT ported in this phase; the real-API gallery replaces them in phase 4. The spec and plan docs are copied onto the new branch in Task 0. Never `git stash`. Bash cwd resets: pin absolute paths.
- Task 0 (before Task 1): create worktree+branch from origin/main, copy `docs/superpowers/specs/2026-08-14-mascot-componentization-design.md` and this plan from the donor branch, commit them as the first commit, open a draft PR.
- Gates before each commit: `pnpm exec fallow audit --format json --quiet --explain --gate-marker agent` (fix INTRODUCED), and at task end `TURBO_CONCURRENCY=70% pnpm turbo run typecheck --filter=@conciv/mascot --filter=@conciv/app --filter=site`.
- Storybook dev may be running on 6006 from this worktree: never run the storybook vitest gate, never touch `.vite`/`.cache/storybook`, never kill the server.

## Source-of-truth note

Tasks below move existing, verified code. Where a step says "move X from `rig.ts:A-B` verbatim", the implementer copies that exact code (adjusting only imports/exports); the cited range in the current `feat/mascot-gaze` HEAD is the authoritative content. Do not rewrite, "improve", or reformat moved logic beyond what imports require. NOTE: an emitter bug-fix batch may land on the branch before execution starts — re-resolve cited line ranges against HEAD at execution time; symbol names are stable.

---

### Task 1: Core scaffolding — constants, types, config

**Files:**

- Create: `packages/mascot/src/core/config.ts`
- Test: none (types/constants only; typecheck is the gate)

**Interfaces:**

- Produces:

```ts
export type MascotState = 'rest' | 'awake'
export type CurveStyle = 'arc' | 'hook' | 'fan' | 'straight' | 'auto'
export type MascotConfig = {
  state: MascotState
  working: boolean
  follow: boolean
}
export const posedProperties = 'yPercent,rotation,scaleX,scaleY'
export const gazeProperties = 'x,y'
export const gazeFalloffPixels = 220
export const gazeRangePixels = 3
export const leanRangeDegrees = 10
export const antennaOrigin = '50% 32.8%'
export const antennaTipFractionX = 0.5
export const antennaTipFractionY = 0.15625
export const reduceMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
```

- [ ] **Step 1:** Create `core/config.ts` with exactly the block above (constant values copied from `rig.ts:11-33`; they must not drift).
- [ ] **Step 2:** Run `TURBO_CONCURRENCY=70% pnpm turbo run typecheck --filter=@conciv/mascot`. Expected: pass.
- [ ] **Step 3:** Commit: `git add packages/mascot/src/core/config.ts && git commit -m "refactor(mascot): core config module"`.

### Task 2: Pure path math with unit tests

**Files:**

- Create: `packages/mascot/src/core/path.ts`
- Create: `packages/mascot/test/path.test.ts`
- Modify: `packages/mascot/src/story-support.tsx` (import `measureEmitterRoom` + types from `../core/path.js` instead of defining them; delete the local copies)

**Interfaces:**

- Produces (moved verbatim from `story-support.tsx` — signature is already final):

```ts
export type EmitterAnchor = {x: number; y: number}
export type EmitterBounds = {top: number; left: number; right: number}
export type EmitterRoom = {rise: number; bend: number}
export function measureEmitterRoom(anchor: EmitterAnchor, bounds: EmitterBounds): EmitterRoom
```

- [ ] **Step 1: Write the failing test** at `packages/mascot/test/path.test.ts`:

```ts
import {describe, expect, it} from 'vitest'
import {measureEmitterRoom} from '../src/core/path.js'

describe('measureEmitterRoom', () => {
  it('gives the full rise and no bend with ample headroom', () => {
    expect(measureEmitterRoom({x: 130, y: 100}, {top: 0, left: 0, right: 260})).toEqual({rise: 54, bend: 0})
  })
  it('bends right when squeezed at the top left', () => {
    const room = measureEmitterRoom({x: 30, y: 28}, {top: 0, left: 0, right: 260})
    expect(room.rise).toBeLessThan(54)
    expect(room.bend).toBeGreaterThan(0)
  })
  it('bends left when squeezed at the top right', () => {
    const room = measureEmitterRoom({x: 230, y: 28}, {top: 0, left: 0, right: 260})
    expect(room.bend).toBeLessThan(0)
  })
  it('keeps a straight column for a trivial squeeze', () => {
    const room = measureEmitterRoom({x: 130, y: 62}, {top: 0, left: 0, right: 260})
    expect(room.bend).toBe(0)
  })
})
```

Adjust the literal expectations to the actual constants found in `story-support.tsx`'s `measureEmitterRoom` (clamp floor 8, cap 54, 12px edge margin, 10px trivial-shortfall threshold, 1.4 bend factor) — the four behaviors above are the contract; exact numbers come from the moved code.

- [ ] **Step 2:** Run `cd packages/mascot && pnpm exec vitest run test/path.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Create `core/path.ts` by moving `measureEmitterRoom` + its types + its private tuning constants verbatim out of `story-support.tsx`; update `story-support.tsx` to import them from `../core/path.js` and re-export for the stories that use them.
- [ ] **Step 4:** Run the test again. Expected: PASS. Also `TURBO_CONCURRENCY=70% pnpm turbo run typecheck --filter=@conciv/mascot --filter=conciv-storybook`: pass.
- [ ] **Step 5:** Commit: `refactor(mascot): pure path math in core with unit tests`.

### Task 3: parts/eyes.ts and parts/antenna.ts

**Files:**

- Create: `packages/mascot/src/core/parts/eyes.ts`
- Create: `packages/mascot/src/core/parts/antenna.ts`
- Test: parity harness in Task 6 (DOM+gsap; no unit tests — repo forbids jsdom)

**Interfaces:**

- Produces:

```ts
// eyes.ts — the translate-gaze half of the current combined handler
export function createEyesFollow(eyes: HTMLElement): {
  pointOf: (event: PointerEvent) => {reach: number; angle: number} | null
  moveTo: (reach: number, angle: number) => void
  reset: (animated: boolean) => void
  kill: () => void
}
// antenna.ts
export function wrapForLean(antenna: HTMLElement): HTMLElement | undefined // rig.ts:42-52 verbatim
export function createAntennaLean(wrapper: HTMLElement): {
  leanTo: (reach: number, angle: number) => void
  reset: (animated: boolean) => void
  kill: () => void
}
export function throbTimeline(antenna: HTMLElement, eyes: HTMLElement): gsap.core.Timeline // the work-loop body, rig.ts startWork timeline verbatim
export function tipOffset(stage: HTMLElement, antenna: HTMLElement): {x: number; y: number} // rig.ts:54-61 verbatim
```

- Consumes: constants from `core/config.ts` (Task 1).

- [ ] **Step 1:** Create `eyes.ts`: `pointOf` holds the shared falloff math from the current `gazePointerMove` body (bounds check, offset, distance, `reach = min(1, distance/gazeFalloffPixels)`, `atan2`); `moveTo` wraps the two `quickTo` setters (x/y, 0.6s power3.out) created lazily on first use; `reset(animated)` reproduces `stopGaze`/`resetGaze` eye halves; `kill` = `gsap.killTweensOf(eyes, gazeProperties)`.
- [ ] **Step 2:** Create `antenna.ts`: move `wrapForLean` and `tipOffset` verbatim; `createAntennaLean` wraps the rotation `quickTo` (0.5s power3.out) + reset/kill on the wrapper; `throbTimeline` returns the repeat -1 timeline currently built inline in `startWork` (throb beats at 0/0.3/1.15/1.45 + eye blink at 1.15/1.22, exact values from `rig.ts` HEAD).
- [ ] **Step 3:** Typecheck filter `@conciv/mascot`. Expected: pass (modules not yet imported anywhere — fallow will flag unused; acceptable INSIDE this task only, resolve by Task 5 before any push; if committing now, fold Tasks 3-5 into one commit at Task 5 instead).
- [ ] **Step 4:** Proceed to Task 4 (no separate commit — see Step 3).

### Task 4: Binary effect module + tip transition

**Files:**

- Create: `packages/mascot/src/core/tip-transition.ts`
- Create: `packages/mascot/src/core/effects/binary.ts`

**Interfaces:**

- Produces:

```ts
// tip-transition.ts
export function enterFromTip(element: HTMLElement): gsap.core.Tween // fromTo scale .2→1 back.out(2.2) .36s
export function exitIntoTip(element: HTMLElement, onComplete: () => void): gsap.core.Tween // to scale .2 opacity 0 power2.in .5s
// effects/binary.ts
export type BinaryEmitter = {element: HTMLElement; start: () => void; stop: () => void; remove: () => void}
export function createBinaryEmitter(stage: HTMLElement, tip: {x: number; y: number}): BinaryEmitter
```

- Consumes: `tipOffset` callers pass the tip; constants from config.

- [ ] **Step 1:** Move the enter/exit tween shapes out of the current `startEmitter`/`stopEmitter` into `tip-transition.ts` with the exact values above.
- [ ] **Step 2:** Move `buildEmitter` (`rig.ts:63-88` at current HEAD — post-bug-batch content wins) into `effects/binary.ts` as the body of `createBinaryEmitter`; `start` = enterFromTip + timeline play, `stop` = exitIntoTip then internal removal, `remove` = immediate kill+remove (current `removeEmitter` body). Keep the emitter-reference-is-the-state idempotence exactly as on HEAD.
- [ ] **Step 3:** Typecheck. Proceed (commit consolidated in Task 5).

### Task 5: createMascot + connect + adapter, rig.ts reduced to re-exports

**Files:**

- Create: `packages/mascot/src/core/mascot.ts`
- Modify: `packages/mascot/src/rig.ts` — becomes: `export {robotLayers}`, old types, and `createFabRobotRig` implemented over `createMascot`
- Modify: `packages/mascot/tsdown.config.ts` — add `src/core/mascot.ts` entry if entries are explicit (inspect; keep dist surface = `rig` + new `core` entry)

**Interfaces:**

- Produces:

```ts
export type MascotService = {
  update: (config: MascotConfig) => void
  connect: () => {
    getRootProps: () => {style: string}
    getHeadProps: () => {style: string}
    getEyesProps: () => {style: string}
    getAntennaProps: () => {style: string}
  }
  registerParts: (parts: {stage: HTMLElement; head: HTMLElement; eyes: HTMLElement; antenna: HTMLElement}) => void
  destroy: () => void
}
export function createMascot(initial: MascotConfig): MascotService
```

`connect()` getters return the layer styling currently supplied by consumers (`position:absolute;inset:0;background-image:url(<layer data URI>);background-repeat:no-repeat;background-position:center;background-size:contain;image-rendering:pixelated`) — content from `robotLayers`; wrappers spread these in phase 2, and the adapter ignores them this phase.

- Consumes: everything from Tasks 1-4.

- [ ] **Step 1:** Implement `createMascot`: internal state = last config; `registerParts` wires gsap targets (transform origins from `rig.ts:99-101`, `wrapForLean`, `sharedParent` from `rig.ts:37-40`); `update(next)` diffs against previous config and drives transitions by mapping the current `apply` state machine (`rig.ts` `apply`/`applyFirst`/`playOpen`/`playClose`/`setOpenPose`/`setClosed`/`startWork`/`stopWork` bodies move here verbatim) with the translation: `rest+!working ↔ closed`, `awake+!working ↔ open`, `working ↔ work` (either state; awake+working runs the work visuals from the awake pose — new but additive; parity harness only pins the three legacy combinations). Follow arming: `startGaze`-equivalent listens when `follow && !working && state === 'rest'` is NOT the rule anymore — arming is purely `follow === true && !working`; the adapter passes `follow: state === 'closed'` to preserve legacy behavior exactly.
- [ ] **Step 2:** Rewrite `createFabRobotRig` as adapter: creates `createMascot`, calls `registerParts` with the caller's layers + derived stage, and maps `apply('closed'|'open'|'work')` to `update({state, working, follow})` with the translation table above; `destroy` passes through. Public exports of `rig.ts` unchanged (`robotLayers`, `RigState`, `RigLayers`, `FabRobotRig`, `createFabRobotRig`) so consumers and stories compile untouched.
- [ ] **Step 3:** Full gates: typecheck (mascot, @conciv/app, site, conciv-storybook), `pnpm lint`, `pnpm format:check`, mascot vitest (path tests), fallow audit (unused-module flags from Tasks 3-4 must now be gone).
- [ ] **Step 4:** Commit Tasks 3-5 together: `refactor(mascot): framework-free core behind createMascot, rig API as adapter`.

### Task 6: Behavior parity verification + embed rebuild

**Files:**

- None in repo (scratchpad harness only)

- [ ] **Step 1:** Run the existing 15-check harness (`/private/tmp/claude-501/-Users-omrikatz-Public-web-aidx/57957ac0-a044-4f90-bf9d-35d83ccaccf6/scratchpad/gaze/verify.mjs` pattern) against a fresh `pnpm turbo run build --filter=@conciv/mascot` dist. Expected: 15/15 PASS including reduced-motion. Any FAIL: fix core, re-run; do not weaken checks.
- [ ] **Step 2:** Revert-check: swap in the pre-refactor `rig.ts` build, confirm harness still passes there too (both green = true parity), restore.
- [ ] **Step 3:** `pnpm turbo run build --filter=@conciv/embed`; grep `conciv-widget.global.js` for `elastic.out(1, 0.5)` and `var(--pw-accent` (evidence the moved code ships). Verify dist has no `solid`/`react` strings.
- [ ] **Step 4:** Check running storybook (if up): rig stories + WorkCombo render without page errors (playwright probe, no server restart).
- [ ] **Step 5:** Commit any fixes; push branch; report harness output verbatim.

---

## Self-review record

- Spec coverage: phase-1 scope only by design — API/context/wrappers (spec §API, solid/, react/) are phases 2-3; 15 remaining effects are phase 4 (spec lists them under architecture, not phase 1); deletion of adapter is phase 5. Core modules, prop-getter `connect`, path math, parity, testing map to Tasks 1-6.
- Placeholders: none; moved-code steps cite exact current symbols/ranges with a HEAD-drift warning.
- Type consistency: `MascotConfig`/`MascotState`/`CurveStyle` defined Task 1, consumed Tasks 5; `tipOffset`/`wrapForLean` signatures identical to rig.ts originals; `measureEmitterRoom` signature unchanged from story-support.
