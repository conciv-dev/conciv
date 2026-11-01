# uno-preset/src

## Overview

Builds the conciv UnoCSS preset: presetWind4 plus a typography preset themed with --chat-* CSS variables, theme tokens (colors, radius, fonts, easing, keyframes), shortcuts for motion, transitions, effects and shadows, and block rules for json-tree, density and the loader.

## Interface

- `presetConciv()` (`index.ts`): Preset '@conciv/uno-preset'; presetWind4 with reset preflight off, variablePrefix `unx-`, class-based dark mode
- `chatColors` / `chatRadius` / `chatFont` / `chatEase` (`index.ts`): re-exports of `colors`, `radius`, `font`, `ease`
- `DENSITY_CLASS` = 'chat-density' / `densityRules` (`density.ts`)
- `colors` (`colors.ts`), `radius` (`radius.ts`), `font` (`fonts.ts`), `ease` (`easing.ts`), `animation` (`animation.ts`): theme tokens
- `motion` (`motion.ts`): `anim-*` and `trans-*` shortcuts
- `effects` (`effects.ts`), `shadows` (`shadow.ts`), `shortcuts` (`shortcuts.ts`: `prose-chat`, `pad-safe`)
- `typography` (`typography.ts`): presetTypography with a --chat-* color scheme
- `jsonTree` (`json-tree.ts`): `json-tree` block rule
- `loaderRules` / `loaderShortcuts` / `loaderPreflight` (`loader.ts`)

## Invariants

- Theme tokens (`colors.ts`, `radius.ts`, `fonts.ts`, `easing.ts`, `animation.ts`): typed with `satisfies Theme[...]`
- Shortcut maps (`motion.ts`, `effects.ts`, `shadow.ts`, `shortcuts.ts`, `loader.ts`): `satisfies StaticShortcutMap`
- `blockRule` (`loader.ts`), `densityRules` (`density.ts`), `jsonTree` (`json-tree.ts`): match the exact class name and scope CSS with `toEscapedSelector`
- `motion` (`motion.ts`): every anim-* shortcut has a motion-reduce fallback; loader rules include prefers-reduced-motion blocks
- `loader-size` (`loader.ts`): `data-size` sm or lg, default 8rem

## Side Effects

- `loaderPreflight` (`loader.ts`): injects global @keyframes and @property CSS when UnoCSS generates

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/uno-preset` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/uno-preset && pnpm typecheck && pnpm lint`
