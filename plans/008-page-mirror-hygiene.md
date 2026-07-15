# 008 — page-mirror: retargeting, animation leak, idle cursor, reduced motion, toast & scroll polish

- **Status**: TODO
- **Commit**: 7fb70e7b
- **Severity**: MEDIUM
- **Category**: Interruptibility / Performance / Accessibility
- **Estimated scope**: 3 files (`packages/page/src/page-mirror.ts`, `packages/page/src/effect-toast.ts`, `packages/page/src/page-handlers.ts`), ~50 lines

## Problem

These run in the **host page** (light DOM — the widget's reduced-motion blanket does not apply).

1. Retargeting defeated (`page-mirror.ts:73`): the cursor glide declares an explicit from-keyframe using `lastX/lastY` — the _previous target_, not the current position. A second mirrored action arriving inside the 240ms glide snaps the cursor to the previous endpoint before gliding. Agent action bursts (click+fill sequences) make this visible.

```ts
// current
cursor.animate([{transform: `translate(${lastX}px, ${lastY}px)`}, {transform: `translate(${cx}px, ${cy}px)`}], {
  duration: CURSOR_MS,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  fill: 'forwards',
})
```

2. Animation leak (`page-mirror.ts:77`): `fill: 'forwards'` with no `commitStyles()`/`cancel()` — every action leaves a live Animation object on the cursor's effect stack, unbounded over a session.

3. Idle artifact (`page-mirror.ts:25-41`): the magenta cursor is appended once and **never removed or faded** — it sits on the host page forever after the last action.

4. No reduced-motion gating anywhere in the file (glide + pulse ring both move).

5. `effect-toast.ts:27-28`: host-page toast appears and is `setTimeout(() => el.remove(), TOAST_MS)`-removed with zero enter/exit.

6. `page-handlers.ts:218`: `el.scrollIntoView({block: 'center'})` teleports the host page.

7. Curve literals duplicate the design tokens (`0.22,1,0.36,1` = `--pw-ease`; `0.16,1,0.3,1` = `--pw-ease-expo`) — host page has no CSS vars, but the TS values exist in `packages/ui-kit-system/src/tokens.ts:41-42`.

## Target

```ts
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const EASE_EXPO = 'cubic-bezier(0.16, 1, 0.3, 1)'
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
```

(Import from `@conciv/ui-kit-system` tokens.ts instead of local constants ONLY if that import doesn't drag UI code into the page bundle — check the dependency direction first; if `packages/page` must stay dependency-light, local constants named `EASE`/`EASE_EXPO` are the fix and the duplication is resolved by naming, with the token value in one obvious place per file.)

- **Glide** (fixes 1+2): implicit retargeting — single keyframe, no explicit from, no forwards-fill accumulation:

```ts
function moveCursorTo(rect: DOMRect): void {
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const cursor = ensureCursor()
  if (reduceMotion()) cursor.style.transform = `translate(${cx}px, ${cy}px)`
  else {
    cursor.animate({transform: `translate(${cx}px, ${cy}px)`}, {duration: CURSOR_MS, easing: EASE, fill: 'none'})
    cursor.style.transform = `translate(${cx}px, ${cy}px)`
  }
  lastX = cx
  lastY = cy
}
```

(Setting the underlying style to the end value + `fill:'none'` means the animation composites on top and cleans itself up; WAAPI retargets from the current computed position because the running animation's current value is the implicit from.)

- **Pulse ring** (fix 4): under reduced motion keep feedback but drop movement — opacity-only keyframes (`[{opacity:0},{opacity:1,offset:0.4},{opacity:0}]`), same duration; full version unchanged otherwise. It already enters at scale 0.92 and self-removes — keep.
- **Idle fade** (fix 3): after each `mirrorPageAction`, (re)start a 4s timer; on expiry animate cursor opacity to 0 over 300ms `EASE` and remove the element + null the cached ref, so the next action recreates it at the new position without a cross-page streak.
- **effect-toast** (fix 5): entrance `[{opacity:0, transform:'translateY(6px)'},{opacity:1, transform:'translateY(0)'}]` 180ms `EASE_EXPO`; exit: at `TOAST_MS - 200`, animate opacity→0 200ms then remove. Under `reduceMotion()`: opacity-only both ways.
- **scrollIntoView** (fix 6): `el.scrollIntoView({block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth'})`.

## Repo conventions to follow

- `reduceMotion()` helper shape: `packages/mascot/src/rig.ts:11`.
- Functions, no classes, no comments; no new dependencies.

## Steps

1. Add `EASE`/`EASE_EXPO`/`reduceMotion` to `page-mirror.ts`; replace the two hardcoded easing strings.
2. Rewrite `moveCursorTo` per Target.
3. Add the idle-fade timer keyed off `mirrorPageAction`.
4. Branch `pulseRing` on `reduceMotion()` (opacity-only variant).
5. Update `effect-toast.ts` enter/exit per Target (its own local `EASE_EXPO`/`reduceMotion` if not shared).
6. Update `page-handlers.ts:218` scroll behavior.
7. Build + run the page package tests: `pnpm turbo run test --filter=@conciv/page`.

## Boundaries

- Do NOT change ACCENT colors, ring geometry, CURSOR_MS/RING_MS/TOAST_MS values.
- Do NOT introduce a motion library.
- Do NOT touch page-driver dispatch logic — only the visual mirror layer.
- If cited code has drifted, STOP and report.

## Verification

- **Mechanical**: `pnpm turbo run test --filter=@conciv/page` passes; typecheck passes.
- **Feel check**: dev app, ask the agent to interact with the page (click + fill several fields fast):
  - Rapid consecutive actions: cursor bends its path toward the new target mid-glide — never snaps back to a previous point first.
  - DevTools → inspect the cursor element after 20 actions: `getAnimations()` in the console returns 0–1 entries, not dozens.
  - Stop interacting: cursor fades out after ~4s; page is clean.
  - Reduced-motion emulation: cursor jumps (no glide), ring pulses opacity only, page scroll is instant, toast fades without translating.
- **Done when**: all four behaviors above hold and no animation accumulation is observable.
