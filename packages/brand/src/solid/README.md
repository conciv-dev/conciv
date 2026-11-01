# brand/src/solid

## Overview

Solid version of the conciv lockup and mark, with the same path data, colors and hover/focus animation as the React version, built on `motion` and `@solid-primitives/event-listener`. `conciv-lockup.tsx` is the entry for the package's `./solid` export (vite lib entry `solid` in `vite.config.ts`) and is the component the Storybook stories in [../README.md](../README.md) render.

## Interface

- `ConcivLockup(props: ConcivLockupProps)` (`conciv-lockup.tsx`): lockup SVG (viewBox `0 0 249.46 56.26`); the wordmark uses `currentColor`, the mark uses `MARK_COLOR`.
- `ConcivLockupProps` (`conciv-lockup.tsx`): `{class?: string; interactive?: boolean}`.
- `ConcivMark(props: ConcivMarkProps)`, `ConcivMarkProps` `{class?: string}` (`conciv-lockup.tsx`): static 64x64 mark.
- DOM hooks: `data-conciv-part="cursor"` and `data-conciv-part="antenna"` (`conciv-lockup.tsx`).

## Invariants

- Reduced motion is checked on every `start` through `window.matchMedia('(prefers-reduced-motion: reduce)')` (`prefersReducedMotion`).
- Pointer handlers do nothing unless `local.interactive` is set, and touch pointers are ignored (`handlePointerEnter`, `handlePointerLeave`).
- Focus listeners are attached in `onMount` only when `interactive` is set and the root svg has a closest `<a>`; a focus event starts the animation only when that `<a>` matches `:focus-visible` (`handleFocus`).
- `interactive` is read once at mount for the focus wiring; toggling it later does not add or remove those listeners (`onMount`).
- At most one blink and one flick run at a time (`blinkHandle` / `flickHandle` guards in `wakeCursor`, `wakeAntenna`, `start`).

## Side Effects

- Adds `focus`/`blur` listeners on the ancestor `<a>` through `makeEventListener`, which removes them on cleanup (`onMount`).
- Sets the cursor `opacity` attribute (`setCursorHidden`) and animates the antenna `transform` (`flickAntenna`).
- Reads `window.matchMedia` (`prefersReducedMotion`).
- Stops blink and flick animations in `onCleanup`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/brand` from the repo root (turbo builds the package and its dependencies first) (Vitest project `brand-solid-browser`); typecheck with `pnpm typecheck`.
