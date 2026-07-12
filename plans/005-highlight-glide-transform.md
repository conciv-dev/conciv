# 005 — Highlight glide: real easing token + transform-based movement

- **Status**: TODO
- **Commit**: 7fb70e7b
- **Severity**: HIGH (broken utility) / MEDIUM (perf)
- **Category**: Cohesion & tokens / Performance
- **Estimated scope**: 1 file (`apps/conciv/src/extensions/highlight.tsx`), ~20 lines

## Problem

```tsx
// apps/conciv/src/extensions/highlight.tsx:19 — current
const GLIDE = 'transition-[left,top,width,height] duration-[80ms] ease-pw-ease'
```

Two defects:

1. `ease-pw-ease` is not a real utility. The easing theme (`packages/uno-preset/src/easing.ts:3-6`) defines keys `pw` and `pw-expo`, so valid utilities are `ease-pw` and `ease-pw-expo`. `ease-pw-ease` generates no CSS; the glide silently runs on the browser default `ease` — the weak built-in curve the design system exists to avoid.
2. The glide transitions `left`, `top`, `width`, `height` — all four are layout properties, re-laid-out and repainted on every retarget while the user sweeps the pointer across the host page (a per-frame-adjacent event). AUDIT rule: animate `transform` and `opacity` only.

The reduced-motion gate at line 86 (`matchMedia('(prefers-reduced-motion: reduce)').matches ? '' : GLIDE`) is correct — keep it.

## Target

The highlight box is `position:fixed` (line 20 `BOX`). Position it once at 0,0 and drive placement with `transform: translate(xpx, ypx) `+ width/height via `scale` is wrong for a bordered box (border scales); instead: keep `width`/`height` as instant (non-transitioned) properties and transition only the translate:

```tsx
const GLIDE = 'transition-transform duration-[80ms] ease-pw'
```

with the element styled `left:0; top:0` and moved via `style={{transform: `translate(${x}px, ${y}px)`, width: …, height: …}}`. Size changes then snap while position glides — for an inspector highlight this reads crisper than the current whole-box morph and removes all per-frame layout.

If the implementation currently sets `style.left/top/width/height` (find the element-update code in the same file), change only the position pair to transform; width/height keep direct assignment.

An acceptable minimal variant (if the transform refactor conflicts with how labels anchor): fix ONLY the easing token (`ease-pw-ease` → `ease-pw`) and keep the property list — but record the perf finding as unresolved in plans/README.md.

## Repo conventions to follow

- Easing utilities: `ease-pw` / `ease-pw-expo` only (`packages/uno-preset/src/easing.ts`).
- Exemplar of transform-driven fixed-position chrome: the FAB drag style `apps/conciv/src/lib/draggable-position.ts:126-138` (transform translate on a fixed element).

## Steps

1. Fix the token: `ease-pw-ease` → `ease-pw` in `GLIDE`.
2. Locate the code applying element geometry (same file, the effect/handler that sets the box position from the hovered element's rect) and convert `left/top` to a `translate()` transform; change `GLIDE`'s property list to `transition-transform`.
3. Confirm the label (`LABEL`, line 22) and hint still track — they use `-translate-y-full` composition; the box transform must not wrap them unless they already share the box's positioning.
4. Rebuild widget.

## Boundaries

- Do NOT touch the reduced-motion gate (line 86) except to keep it compiling.
- Do NOT change colors/shadows/outline in `BOX`.
- Do NOT add a spring/library — an 80ms token-eased transition is the design.
- If `GLIDE` differs from the excerpt, STOP and report drift.

## Verification

- **Mechanical**: typecheck + widget build; generated CSS contains `.ease-pw` on the glide element (inspect via DevTools) — transition-timing-function shows `cubic-bezier(0.22, 1, 0.36, 1)`, not `ease`.
- **Feel check**: dev app, hold the highlight modifier and sweep across page elements:
  - The box glides between targets with a crisp quart settle; no rubbery browser-`ease` feel.
  - DevTools Performance panel while sweeping: no purple Layout blocks attributable to the highlight box per retarget (with the transform variant).
  - Reduced-motion emulation: box jumps instantly (gate unchanged).
- **Done when**: `ease-pw-ease` gone; glide visibly eased by the token; (full variant) no layout-property transitions remain on the box.
