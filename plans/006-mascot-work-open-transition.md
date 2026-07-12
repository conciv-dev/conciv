# 006 — Mascot: real work→open tween; keep work indication under reduced motion

- **Status**: TODO
- **Commit**: 7fb70e7b
- **Severity**: MEDIUM
- **Category**: Interruptibility / Accessibility
- **Estimated scope**: 1 file (`packages/mascot/src/rig.ts`), ~15 lines

## Problem

1. The work→open transition is a snap disguised as a tween:

```ts
// packages/mascot/src/rig.ts:96 — current
gsap.to(parts, {duration: 0.3, ease: 'power2.out', onStart: setOpenPose})
```

The tween declares **no animatable properties**; `onStart` runs `setOpenPose` which is a `gsap.set` — instant. The robot can be mid-blink (eyes at `scaleY: 0.1`, rig.ts:70) and teleports to the open pose. The 300ms/power2.out is dead code.

2. Under reduced motion the working state renders the _closed_ pose:

```ts
// packages/mascot/src/rig.ts:62 — current
if (reduceMotion()) return setClosed()
```

while 'open' correctly gets a static open pose (rig.ts:36). Reduced motion should reduce movement, not delete the state indication — a static work pose (or static open pose, since "work" is visually open-with-glow at the app layer) is the consistent behavior.

## Target

1. Tween to real values. Replace the empty tween with a property tween to the open pose values. `setOpenPose` defines the target numbers — copy the exact same values into the tween (do not approximate; read them from `setOpenPose` in the file). Shape:

```ts
gsap.killTweensOf(parts)
gsap.to(head, {<open-pose head props>, duration: 0.3, ease: 'power2.out'})
gsap.to(eyes, {<open-pose eyes props>, duration: 0.3, ease: 'power2.out'})
gsap.to(antenna, {<open-pose antenna props>, duration: 0.3, ease: 'power2.out'})
```

(If `setOpenPose` sets identical props on all parts, a single `gsap.to(parts, {...})` with those props is fine.) `killTweensOf` first, matching the pattern the open/close paths already use.

2. Reduced-motion work state: `rig.ts:62` becomes `if (reduceMotion()) return setOpenPose()` — static open pose while working (the app's CSS glow at `apps/conciv/src/styles.css:91` is itself flattened by the app's reduced-motion reset, which is fine and out of scope).

## Repo conventions to follow

- `gsap.killTweensOf(parts)` before starting a new pose transition — exemplar: the existing `playOpen`/`playClose` paths in this same file.
- Functions, no classes; no comments.

## Steps

1. Read `setOpenPose` in `packages/mascot/src/rig.ts` and note every property/value it sets per part.
2. Replace line 96's empty tween with `killTweensOf` + real tween(s) to those exact values (0.3s, `power2.out` — unchanged).
3. Change line 62 `setClosed()` → `setOpenPose()`.
4. Build: `pnpm turbo run build --filter=@conciv/mascot --filter=@conciv/widget`.

## Boundaries

- Do NOT touch `playOpen`, `playClose`, `startWork`'s loop content, blink timings, or transform-origins (rig.ts:18-20 metrics are load-bearing).
- Do NOT change durations/eases elsewhere; the `power2.in` anticipation frames are deliberate character animation.
- If line 96/62 differ from the excerpts, STOP and report.

## Verification

- **Mechanical**: typecheck + build pass.
- **Feel check**: dev app; ask the agent something, and while the robot is "thinking", open the panel (work→open):
  - The robot eases into the open pose over ~300ms — no snap, even when the trigger lands mid-blink.
  - Rapidly toggle open/close during work: no pose fighting or double-motion (killTweensOf holds).
  - Reduced-motion emulation: while working, the robot sits in the static open pose (not the closed one); no movement anywhere.
- **Done when**: work→open is a visible eased transition and reduced-motion work state shows an open, still robot.
