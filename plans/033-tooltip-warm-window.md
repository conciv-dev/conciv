# 033 — Tooltip warm window: skip the open delay across adjacent icons

- **Status**: TODO
- **Commit**: 3d9225ea
- **Severity**: MEDIUM
- **Category**: Purpose & frequency
- **Estimated scope**: 1 file (`packages/ui-kit-system/src/tooltip.tsx`), ~15 lines

## Problem

Every `TooltipIconButton` mounts its own `Tooltip.Root` with a fresh 300ms `openDelay`. Moving
the pointer across a toolbar (message action bar: Copy → Refresh → More; panel header: pop-out →
close) re-pays the full 300ms delay plus the fade on every icon. The playbook rule: in a toolbar,
after the first tooltip has shown, subsequent ones should appear (near-)instantly. Radix solves
this with `TooltipProvider skipDelayDuration`; Ark/Zag has no equivalent provider, so each Root
is an island.

```tsx
// packages/ui-kit-system/src/tooltip.tsx:7-17 — current
function Root(props: ComponentProps<typeof Ark.Root>) {
  const [local, rest] = splitProps(props, ['positioning', 'openDelay', 'closeDelay'])
  return (
    <Ark.Root
      openDelay={local.openDelay ?? 300}
      closeDelay={local.closeDelay ?? 80}
      positioning={{strategy: 'fixed', placement: 'top', gutter: 6, ...local.positioning}}
      {...rest}
    />
  )
}
```

`TooltipIconButton` (`packages/ui-kit-system/src/tooltip-icon-button.tsx:23`) goes through this
Root, so fixing Root fixes every icon button in the widget.

## Target

A module-scope "warm window" shared by all tooltip Roots in the package: when any tooltip closes,
record the time; a Root whose open intent arrives within 300ms of that close uses `openDelay: 0`.
An explicit `openDelay` prop from a caller still wins.

```tsx
// target shape — module scope, above Root
const WARM_WINDOW_MS = 300
const [lastClosedAt, setLastClosedAt] = createSignal(0)

function Root(props: ComponentProps<typeof Ark.Root>) {
  const [local, rest] = splitProps(props, ['positioning', 'openDelay', 'closeDelay', 'onOpenChange'])
  return (
    <Ark.Root
      openDelay={local.openDelay ?? (performance.now() - lastClosedAt() < WARM_WINDOW_MS ? 0 : 300)}
      closeDelay={local.closeDelay ?? 80}
      positioning={{strategy: 'fixed', placement: 'top', gutter: 6, ...local.positioning}}
      onOpenChange={(details) => {
        if (!details.open) setLastClosedAt(performance.now())
        local.onOpenChange?.(details)
      }}
      {...rest}
    />
  )
}
```

Why a signal and not a plain `let`: Solid compiles JSX props to getters, and the signal write on
close makes the `openDelay` getter re-evaluate, so Zag sees the updated delay on the next open
intent. Keep `performance.now()` (monotonic) rather than `Date.now()`.

Keep `WARM_WINDOW_MS = 300` (matches Radix's `skipDelayDuration` default) and keep the existing
content fade (`anim-combo`) — the warm window removes the delay, not the transition.

## Repo conventions to follow

- Functions, not classes; zero code comments; no non-null assertions; oxfmt style.
- Module-scope signals are acceptable in ui-kit-system for cross-instance coordination (this is
  the first such case in tooltip.tsx — keep it to the two declarations above Root).
- `splitProps` for prop handling, as the file already does. Note `onOpenChange` must be added to
  the `splitProps` list and forwarded, as shown.

## Steps

1. Edit `packages/ui-kit-system/src/tooltip.tsx`: add the module-scope signal + constant, extend
   `splitProps`, wire `openDelay` and `onOpenChange` exactly as in the Target block.
2. `pnpm turbo run build --filter=@conciv/ui-kit-system` then `pnpm typecheck`.
3. Rebuild the widget bundle before any browser check:
   `pnpm turbo run build --filter=@conciv/embed`.

## Boundaries

- Do NOT touch `tooltip-icon-button.tsx` — it inherits the fix through Root.
- Do NOT add a provider/context — the module-scope signal is the whole mechanism.
- Do NOT change `closeDelay`, positioning, or the content styling.
- If Zag turns out to read `openDelay` only once at machine creation (the warm window never
  activates in the feel check), STOP and report — the fallback design (recreating the machine or
  patching Zag) is a maintainer decision, not an executor improvisation.

## Verification

- **Mechanical**: `pnpm typecheck && pnpm turbo run build --filter=@conciv/ui-kit-system` pass.
- **Feel check** (real browser, widget open on any page with a chat message):
  - Hover the Copy icon in the message action bar: tooltip appears after ~300ms (unchanged).
  - Without leaving the toolbar, move to Refresh, then More: each tooltip appears immediately
    (no perceptible delay).
  - Move the pointer away for >1s, hover an icon again: the 300ms delay is back.
  - Tooltips still fade in (the `anim-combo` transition is untouched).
- **Done when**: the second-and-later tooltips in a sweep are instant, the first is delayed, and
  an idle pause resets the delay.
