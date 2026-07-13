# 035 — Context-usage ring and meter fill as motion

- **Status**: TODO
- **Commit**: 3d9225ea
- **Severity**: LOW (missed opportunity)
- **Category**: Missed opportunities
- **Estimated scope**: 1 file (`apps/conciv/src/chat/context-tracker.tsx`), ~4 lines

## Problem

The context-usage indicator teleports to each new value instead of reading as "filling". Updates
arrive per turn (usage snapshots), so a brief transition is legible, cheap, and infrequent.

```tsx
// apps/conciv/src/chat/context-tracker.tsx:34-45 — current (progress arc)
<circle
  ...
  stroke-linecap="round"
  stroke-dasharray={`${circ} ${circ}`}
  stroke-dashoffset={circ * (1 - props.percent)}
  style={{transform: 'rotate(-90deg)', 'transform-origin': 'center'}}
/>
```

```tsx
// apps/conciv/src/chat/context-tracker.tsx:91 — current (meter fill in the hover card)
<div class="bg-pw-accent h-full" style={{width: `${Math.min(100, (props.percent ?? 0) * 100)}%`}} />
```

The ring jumps its arc; the meter bar jumps its width (and `width` is a layout property).

## Target

- **Ring**: transition `stroke-dashoffset` (a paint-only CSS property, transitionable on SVG).
  Add to the progress `<circle>`'s class:

```
[transition:stroke-dashoffset_300ms_var(--pw-ease)]
```

(Add a `class="..."` attribute to that `<circle>` — it currently has none; keep the inline
rotate style as is.)

- **Meter fill**: replace the width write with a transform so the fill is compositor-only:

```tsx
<div
  class="bg-pw-accent h-full w-full origin-left [transition:transform_300ms_var(--pw-ease)]"
  style={{transform: `scaleX(${Math.min(1, props.percent ?? 0)})`}}
/>
```

The parent (`rounded-full bg-pw-fill-soft h-1.5 overflow-hidden`, line 84) clips the scaled
fill; at 6px height the corner distortion from scaleX is imperceptible.

Values: 300ms, `var(--pw-ease)` (`cubic-bezier(0.22,1,0.36,1)`, defined in
`packages/ui-kit-system/src/tokens.css:38`) — an ease-out on a growing fill, within the playbook's
UI budget.

## Repo conventions to follow

- Arbitrary-property utility classes (`[transition:...]`) are the widget norm — see
  `apps/conciv/src/routes/panel.tsx:18-20` or any `trans-*` shortcut in
  `packages/uno-preset/src/motion.ts`.
- Reduced motion: the widget blanket reset (`apps/conciv/src/styles.css:125-131`) flattens all
  transition durations — add nothing.
- Zero code comments; oxfmt style.

## Steps

1. Edit `Ring` in `apps/conciv/src/chat/context-tracker.tsx`: add the transition class to the
   progress circle.
2. Edit `ContextMeter`: swap the width write for the scaleX version above.
3. `pnpm turbo run build --filter=conciv` (check the app's package name in
   `apps/conciv/package.json`; use that filter) + `pnpm typecheck`.
4. Rebuild the widget bundle: `pnpm turbo run build --filter=@conciv/embed`.

## Boundaries

- Do NOT touch the track circle, the percent text, `aria-*` attributes, or the hover-card
  structure.
- Do NOT animate the numeric percent label (tabular-nums text should snap).
- If the cited lines drifted, STOP and report.

## Verification

- **Mechanical**: typecheck + builds pass.
- **Feel check** (real browser, widget with an active session):
  - Send a message; when the usage snapshot lands, the ring arc sweeps to its new value over
    ~300ms and the hover-card meter fills smoothly (open the hover card first, then send).
  - The percent text updates instantly (no tweened numbers).
  - DevTools Rendering → prefers-reduced-motion: reduce — both fills snap (blanket reset).
- **Done when**: ring and meter animate value changes; text does not; reduced-motion snaps.
