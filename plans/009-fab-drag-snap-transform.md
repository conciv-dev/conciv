# 009 — FAB drag snap: transform instead of left/top; easing via token value

- **Status**: TODO
- **Commit**: 7fb70e7b
- **Severity**: MEDIUM
- **Category**: Performance / Cohesion & tokens
- **Estimated scope**: 1 file (`apps/conciv/src/lib/draggable-position.ts`), ~15 lines

## Problem

```ts
// apps/conciv/src/lib/draggable-position.ts:136 — current
transition: snapping() ? `left ${SNAP_MS}ms ${SNAP_EASE}, top ${SNAP_MS}ms ${SNAP_EASE}` : 'none',
```

The release-snap animates `left`/`top` — layout properties — forcing layout+paint every frame for 280ms. And:

```ts
// apps/conciv/src/lib/draggable-position.ts:7 — current
const SNAP_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
```

hardcodes the value of the `--pw-ease-expo` token.

## Target

Drag keeps updating `left`/`top` per pointermove without a transition (unchanged behavior, no transition = no per-frame layout _animation_; the drag itself necessarily positions the element). For the snap: freeze `left`/`top` at the release point and animate a `transform: translate()` delta to the preset center, then commit.

```ts
const SNAP_EASE = 'var(--pw-ease-expo)'
```

(the FAB lives inside the widget shadow root where `--pw-ease-expo` resolves — `packages/ui-kit-system/src/tokens.css:39` is scoped `:host,:root`).

`dragStyle()` target shape:

```ts
const dragStyle = (): JSX.CSSProperties => {
  const current = point()
  if (!current) return {}
  const target = snapTarget()
  const dx = target ? target.x - current.x : 0
  const dy = target ? target.y - current.y : 0
  return {
    position: 'fixed',
    left: `${current.x}px`,
    top: `${current.y}px`,
    right: 'auto',
    bottom: 'auto',
    transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`,
    transition: snapping() ? `transform ${SNAP_MS}ms ${SNAP_EASE}` : 'none',
  }
}
```

with a new `snapTarget` signal set in `up()` instead of overwriting `point` (`setPoint(presetCenter(...))` at line 110 becomes `setSnapTarget(presetCenter(...))`; `commit` clears both). The element ends visually at the preset center; `commit()` then swaps to the preset class exactly as today.

## Repo conventions to follow

- Transform-based movement on fixed chrome; tokens for every curve (see `trans-*` shortcuts in `packages/uno-preset/src/motion.ts`).
- The reduced-motion early-commit branch (lines 104-107) stays as-is.

## Steps

1. Replace `SNAP_EASE` value with `var(--pw-ease-expo)`.
2. Add `const [snapTarget, setSnapTarget] = createSignal<{x: number; y: number} | null>(null)`; in `up()` set it instead of re-pointing `point`; clear it in `commit()` alongside `setPoint(null)`/`setSnapping(false)`.
3. Rewrite `dragStyle()` per Target.
4. Rebuild widget; drag the FAB in the dev app.

## Boundaries

- Do NOT change `SNAP_MS`, preset geometry, storage, or click-suppression logic.
- Do NOT animate during the drag itself.
- If cited lines drifted, STOP and report.

## Verification

- **Mechanical**: typecheck + widget build pass.
- **Feel check**: drag the FAB and release far from a corner:
  - It glides to the nearest preset with the expo settle, visually identical to before (or crisper).
  - DevTools Performance during the snap: no Layout entries driven by the FAB (transform-only).
  - Release then immediately grab again mid-snap: pointer-down interrupts cleanly (transition retargets/stops; no fight).
  - Reduced-motion: release commits instantly (existing branch).
- **Done when**: snap is transform-only and the easing rides the token.
