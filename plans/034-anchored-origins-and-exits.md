# 034 — Anchored origins + symmetric exits (action-bar menu, whiteboard panels, pins)

- **Status**: TODO
- **Commit**: 3d9225ea
- **Severity**: MEDIUM
- **Category**: Physicality & origin + Interruptibility
- **Estimated scope**: 5 files, ~40 lines

## Problem

Four related physicality gaps left by the PR#54 pass:

**F1 — The action-bar More menu scales from its own center, not its trigger.**
`packages/ui-kit-chat/src/styled/action-bar.tsx:11-13`:

```ts
const MENU =
  'min-w-32 p-1.5 rounded-[var(--chat-radius-md)] [border:1px_solid_var(--chat-line)] [background:var(--chat-panel)] shadow-[var(--chat-shadow-lg)] anim-presence-in'
```

`anim-presence-in` is a `scale(0.96) → 1` keyframe. The menu is trigger-anchored (Ark Menu via
`ActionBarMore`, `packages/ui-kit-chat/src/primitives/action-bar-more/action-bar-more.tsx:38-44`
wraps `Menu.Positioner > Menu.Content`). Zag's positioner middleware sets a `--transform-origin`
CSS custom property (verified in `@zag-js/popper` `middleware.mjs:7`:
`transformOrigin: toVar("--transform-origin")`), but nothing consumes it, so the scale emanates
from center instead of the trigger corner.

**F2 — Whiteboard inbox and compose panels animate in but teleport out.**
`packages/extensions/whiteboard/src/client/inbox.tsx:8-9` (PANEL has `anim-presence-in`, mounted
by `<Show when={model.inboxOpen()}>` at `inbox.tsx:104`) and
`packages/extensions/whiteboard/src/client/pins/compose.tsx:5-6` (PANEL has `anim-presence-in`,
mounted by `<Show when={model.composeTarget()}>` at
`packages/extensions/whiteboard/src/client/overlay.tsx:82` — note: `client/overlay.tsx`, NOT
under `pins/`). Solid's `<Show>` unmounts
instantly — no exit. `anim-presence-out` exists (`packages/uno-preset/src/motion.ts:29`) and the
shared `Presence` component (`packages/ui-kit-system/src/presence.tsx`) already pairs both.

**F3 — Those same panels scale from center, but neither is centered.**
The inbox is a right-edge drawer (`fixed right-0 top-0 bottom-0`, `inbox.tsx:9`); the compose
panel is anchored top-left at the click point (`style={{left: x, top: y}}`, `compose.tsx:21`).
Per the playbook, only modals are exempt from origin-correct scaling.

**F4 — A dropped pin eases to its spot; its anchor tag jumps.**
`packages/extensions/whiteboard/src/client/pins/pins.tsx:115` gives the pin
`[transition:transform_200ms_var(--pw-ease-expo)]` when not dragging, but the anchor label
(`pins.tsx:169-171`, positioned via `transform: translate(...)`) has no transition, so it
teleports to the final coordinates while the pin glides — visible desync on every drop.
(The dashed SVG connector `<line>` at `pins.tsx:99-107` also jumps, but `<line>` endpoints
(`x1/y1/x2/y2`) are attributes, not CSS-transitionable properties — leave the line as is; note
it in the PR as an accepted limitation.)

**F5 (rider) — Pin-thread header buttons snap their hover background.**
`packages/extensions/whiteboard/src/client/pins/thread.tsx:18-19`:

```ts
const HEADER_BTN =
  'inline-flex size-7 items-center justify-center rounded-pw-sm text-pw-text-2 [outline:none] hover:bg-pw-fill focus-ring'
```

Missing the `trans-bg` shortcut its siblings got in PR#54 (plan 017 E6 residual; the equivalent
inbox buttons at `inbox.tsx:12-15` already carry `trans-bg`).

## Target

- **F1**: add `[transform-origin:var(--transform-origin)]` to the MENU class string. Zag sets the
  variable on the positioner; it inherits to the content element where the keyframe runs.
- **F2**: wrap each panel body in the shared `Presence` component from `@conciv/ui-kit-system`
  (`presence.tsx` — `data-[state=open]:anim-presence-in data-[state=closed]:anim-presence-out`)
  with `present={...}` + `lazyMount` + `unmountOnExit`, replacing the bare `<Show>`:
  - Inbox: `present={model.inboxOpen()}` replacing the `<Show when={model.inboxOpen()}>` at
    `inbox.tsx:104`. Remove `anim-presence-in` from the PANEL string (Presence now owns both
    directions).
  - Compose: `present={model.composeTarget() !== null}` replacing the `<Show>` at
    `packages/extensions/whiteboard/src/client/overlay.tsx:82`. The child needs the target while exiting (the signal is already null):
    capture the last non-null target in a signal —
    `createEffect(() => { const t = model.composeTarget(); if (t) setLastTarget(t) })` — and
    render from `lastTarget()`. Remove `anim-presence-in` from compose's PANEL string.
- **F3**: static origin classes, following the `PANEL_POS` exemplar in
  `apps/conciv/src/routes/panel.tsx:9-15` (`[transform-origin:top_left]` etc.):
  - inbox PANEL: `[transform-origin:right_center]`
  - compose PANEL: `[transform-origin:top_left]`
- **F4**: give the anchor tag the same conditional transition as the pin. On the `<span>` at
  `pins.tsx:169`, add
  `classList={{'[transition:transform_200ms_var(--pw-ease-expo)]': drag()?.cid !== pin.cid}}`
  (mirror of `pins.tsx:115` — must stay conditional or the tag lags during drag).
- **F5**: `HEADER_BTN` gains `trans-bg` (the UnoCSS shortcut
  `[transition:background-color_120ms_var(--pw-ease)]`, defined in
  `packages/uno-preset/src/motion.ts:41`).

## Repo conventions to follow

- Widget reduced-motion is blanket-handled (`apps/conciv/src/styles.css:125`) and the
  `anim-presence-*` shortcuts already carry `motion-reduce:animate-none` — do not add per-element
  gates.
- Exit-phase exemplar: `apps/conciv/src/routes/panel.tsx:40-55` (closing signal +
  `onTransitionEnd`) is the manual pattern; this plan uses the higher-level `Presence` component
  instead — prefer it wherever Ark's Presence fits.
- Class strings live in module-level `const` SCREAMING_CASE strings; edit in place.
- Zero code comments; oxfmt style; functions not classes.

## Steps

1. F1: `action-bar.tsx` MENU string.
2. F5: `thread.tsx` HEADER_BTN string. (One-line edits first — independently revertable.)
3. F3: origin classes on both PANEL strings.
4. F2 inbox: swap `<Show>` → `Presence` in `inbox.tsx`, drop `anim-presence-in` from PANEL.
5. F2 compose: swap `<Show>` → `Presence` in `client/overlay.tsx` with the `lastTarget` capture, drop
   `anim-presence-in` from compose PANEL.
6. F4: anchor-tag transition in `pins.tsx`.
7. `pnpm turbo run build --filter=@conciv/extension-whiteboard --filter=@conciv/ui-kit-chat`,
   `pnpm typecheck`, then the whiteboard package tests:
   `pnpm turbo run test --filter=@conciv/extension-whiteboard` (pin tests assert projected
   positions via `getBoundingClientRect` — they must stay green; a transition on the tag may
   require the test to wait for settle like the pin tests already do).
8. Rebuild the widget bundle before browser checks:
   `pnpm turbo run build --filter=@conciv/embed`.

## Boundaries

- Do NOT touch the SVG `<line>` connector (accepted limitation, see F4).
- Do NOT convert other `<Show>` mounts to Presence — only the two panels named here.
- Do NOT alter menu positioning, panel layout, or z-index values.
- Do NOT edit `presence.tsx`, `motion.ts`, or `animation.ts` — consumers only.
- If `Presence` from `@conciv/ui-kit-system` doesn't accept `present`/`lazyMount`/`unmountOnExit`
  (it forwards to Ark's Presence, which does), STOP and report instead of hand-rolling a
  closing-state machine.
- If whiteboard pin tests fail for timing reasons you cannot fix with an existing wait pattern,
  STOP and report.

## Verification

- **Mechanical**: typecheck + builds + whiteboard tests green.
- **Feel check** (real browser, whiteboard view + a chat message):
  - Open the message More menu in slow motion (DevTools Animations, 10%): the menu grows from
    the trigger corner, not from its center.
  - Toggle the whiteboard inbox: it scales in from the right edge and scales/fades OUT when
    closed — no teleport. Spam the toggle: reopening mid-exit never gets stuck hidden or
    double-mounted.
  - Click the canvas to compose: panel grows from its top-left (the click point); cancel: it
    fades out in place, and the NEXT compose opens at the new click point (the lastTarget capture
    must not show a stale position during entry).
  - Drag a pin and release: pin and its anchor label glide together; during the drag both track
    the pointer with zero lag.
  - Hover a pin-thread header button: background fades in ~120ms instead of snapping.
- **Done when**: all five checks hold and whiteboard tests pass.
