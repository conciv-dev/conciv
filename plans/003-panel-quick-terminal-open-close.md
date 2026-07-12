# 003 — Wire the inert panel & quick-terminal open/close choreography

- **Status**: TODO
- **Commit**: 7fb70e7b
- **Severity**: HIGH
- **Category**: Interruptibility / Missed opportunity
- **Estimated scope**: 3 files (`apps/conciv/src/routes/panel.tsx`, `apps/conciv/src/routes/quick.tsx`, possibly `packages/uno-preset/src/motion.ts`), ~40 lines

## Problem

The product's primary surface — the chat panel — has designed open/close motion that never runs:

```tsx
// apps/conciv/src/routes/panel.tsx:18 — current
const PANEL_OPEN = 'opacity-100 [transform:none] pointer-events-auto visible trans-pop-in'
```

The panel is mounted via `<Show when={search().open}>` (panel.tsx:53), so it enters the DOM already at its final values — `trans-pop-in` (a transition, `packages/uno-preset/src/motion.ts:51`) has nothing to transition from and never fires. Closing unmounts it: an instant teleport. The exit half, `trans-pop-out` (`motion.ts:52`, `[transition:opacity_200ms_var(--pw-ease),transform_240ms_var(--pw-ease-expo),visibility_0s_linear_240ms]`), has **zero usages** — designed and never wired.

Same inert pattern on the quick terminal:

```tsx
// apps/conciv/src/routes/quick.tsx:26 — current (excerpt)
'… will-change-transform … transition-transform duration-300 ease-pw-expo … fixed … translate-y-0'
```

Router-mounted, permanently at `translate-y-0`, so the drop-down never slides; `will-change-transform` is a permanently-paid perf hint for a transition that never fires.

## Target

Keep the `<Show>` mount but give entry a from-state via `@starting-style`-equivalent utilities, and keep transitions (not keyframes) so rapid open/close retargets mid-flight.

Panel (`apps/conciv/src/routes/panel.tsx`):

```tsx
const PANEL_OPEN =
  'pointer-events-auto trans-pop-in opacity-100 [transform:none] starting:opacity-0 starting:[transform:translateY(8px)_scale(0.98)]'
```

- `starting:` is UnoCSS's `@starting-style` variant. If the installed UnoCSS version lacks it, add an equivalent raw rule instead: give the section a stable marker class (e.g. keep `data-pw-panel`) and add to `apps/conciv/src/styles.css`:

```css
@starting-style {
  [data-pw-panel] {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
}
```

- The panel already sets `[transform-origin:bottom_right]` etc. per position (panel.tsx:10-14) — the scale therefore grows from the FAB corner, which is the spatially correct origin. Keep those.
- Exit: animating unmount in Solid needs the element kept mounted through the transition. Smallest correct approach: keep `<Show>` for the fully-closed state but drive a `data-closing` phase — on close, set `data-closing`, apply `trans-pop-out opacity-0 [transform:translateY(8px)_scale(0.98)] invisible`, and unmount after `transitionend` on `opacity` (fallback timeout 260ms). If this proves invasive, an acceptable reduced scope is: wire the entry only, delete the dead `trans-pop-out` token, and note the exit as follow-up — but say so in the PR.

Quick terminal (`apps/conciv/src/routes/quick.tsx:26`): same pattern, sliding from its own height (it is top-anchored):

```
transition-transform duration-300 ease-pw-expo translate-y-0 starting:-translate-y-full
```

Remove `will-change-transform` (transition is short-lived; the permanent hint costs more than it saves).

Durations: panel 200ms opacity / 240ms transform (already encoded in `trans-pop-in`); quick terminal 300ms (drawer budget 200–500ms — fine).

## Repo conventions to follow

- Transitions over keyframes for reversible surfaces — exemplar: the suppressed-overlay fade `apps/conciv/src/styles.css:111-117` (`transition: opacity 140ms var(--pw-ease)`).
- Easing via tokens only: `var(--pw-ease)` / `var(--pw-ease-expo)` (`packages/ui-kit-system/src/tokens.css:38-39`).
- Reduced motion is handled globally by the shadow-root blanket reset (`apps/conciv/src/styles.css:125-131`) — no extra gating needed here.

## Steps

1. `apps/conciv/src/routes/panel.tsx:18`: replace `PANEL_OPEN` with the target string (or the CSS `@starting-style` fallback — check UnoCSS `starting:` variant support first by generating a probe class).
2. Verify entry animates; then implement the `data-closing` exit phase described above in `PanelLayout` (panel.tsx:27+): a local `closing` signal, `close()` sets it, `transitionend`/timeout completes `setShutter(router, false)`.
3. `apps/conciv/src/routes/quick.tsx:26`: add `starting:-translate-y-full`, remove `will-change-transform`. Exit phase mirrors step 2 if the quick layer unmounts on close; if it stays mounted, toggle `-translate-y-full` directly.
4. If the exit work is descoped, delete `'trans-pop-out'` from `packages/uno-preset/src/motion.ts:52` only if it remains unused; otherwise it becomes used and stays.
5. Rebuild widget: `pnpm turbo run build --filter=@conciv/widget`.

## Boundaries

- Do NOT convert the panel to keyframe entrances (`anim-*`) — it must be interruptible.
- Do NOT restructure routing or `setShutter`; only add the closing phase around the existing call.
- Do NOT touch the resize handles, FocusTrap, or layers logic in panel.tsx.
- If `PANEL_OPEN`/`qtShellClass` content differs from the excerpts, STOP and report drift.

## Verification

- **Mechanical**: `pnpm typecheck`, widget build, and the widget integration tests (`pnpm turbo run test --filter=@conciv/widget`) pass.
- **Feel check**: dev app:
  - Click FAB: panel fades + rises 8px + scales from 0.98 anchored at the FAB corner, ~240ms, crisp expo settle.
  - Click FAB rapidly 5×: the panel retargets mid-flight — never restarts from the 8px/0.98 state, never flashes.
  - Close: reverse motion (if exit implemented), no teleport.
  - Quick terminal (if enabled): slides down from above the viewport edge; toggling mid-slide reverses smoothly.
  - Emulate `prefers-reduced-motion: reduce`: open/close is effectively instant (blanket reset), still functional.
- **Done when**: `trans-pop-in` demonstrably fires (visible in DevTools transitions), close is not a hard cut (or descope is explicitly noted), quick terminal slides.
