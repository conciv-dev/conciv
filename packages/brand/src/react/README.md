# brand/src/react

## Overview

React version of the conciv logo: the full lockup (mark plus wordmark) and the standalone mark, rendered as inline SVG path data. With `interactive` set, the lockup runs a hover/focus animation built on `motion/react`. `conciv-lockup.tsx` is the entry for the package's `./react` export (built by tsdown, `tsdown.config.ts` entry `react`).

## Interface

- `ConcivLockup({className?, interactive = false})` (`conciv-lockup.tsx`): 249.46x56.26 viewBox SVG with `role="img"` and `aria-label="conciv"`. With `interactive` it renders the internal `InteractiveLockup`, otherwise the static `LockupSvg`.
- `ConcivMark({className?})` (`conciv-lockup.tsx`): static 64x64 mark SVG filled with `MARK_COLOR` (`#D7263D`).
- DOM hooks: `data-conciv-part="cursor"` on the cursor path and `data-conciv-part="antenna"` on the antenna group (`conciv-lockup.tsx`). The browser tests select these through `tests/browser/lockup-dom.ts`.

## Invariants

- When `useReducedMotion()` is true, `start` returns early: no blink and no flick (`conciv-lockup.tsx`).
- Pointer events with `pointerType === 'touch'` do not start the animation (`handlePointerEnter`).
- At most one blink and one antenna flick run at a time: `start` checks `blink.current`, and `flick.current` is cleared when `finished` resolves.
- Focus starts the animation only when the closest ancestor `<a>` matches `:focus-visible`; with no ancestor anchor no focus listeners are attached (`bindFocusTrigger`).
- `setCursorHidden(cursor, hidden)` maps `hidden=true` to opacity `'1'` (the cursor overlay is visible); `stop` calls it with `false`.
- Timing: `BLINK_HALF` = 0.6s linear, repeating in reverse. The flick is a spring (stiffness 320, damping 6, mass 1.2) over `ANTENNA_WOBBLE`, transform origin `ANTENNA_ORIGIN` (40.035px 13.5px).

## Side Effects

- Adds `focus`/`blur` listeners on the closest ancestor `<a>` and removes them in the ref callback cleanup (`bindFocusTrigger`).
- Sets the cursor path `opacity` attribute (`setCursorHidden`) and animates the antenna group `transform` through motion `animate` (`flickAntenna`).
- Stops running blink and flick animations on unmount (`useEffect` cleanup).

## Verification

- Run: `cd packages/brand && pnpm test` (Vitest project `brand-react-browser`); typecheck with `pnpm typecheck` (`tsconfig.react.json`).
