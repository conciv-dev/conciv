# uno-preset/src

## Overview

`presetConciv()` (`uno-preset.ts`, preset name `@internal/uno-preset`) builds the conciv UnoCSS preset: presetWind4 (reset preflight off, variablePrefix `unx-`, class-based dark mode) plus a typography preset themed with --chat-* CSS variables, theme tokens (colors, radius, fonts, easing, keyframes), shortcuts for motion, transitions, effects and shadows, and block rules for json-tree, density and the loader.

`presetConciv({sheet: 'plugin'})` emits utilities only (no preflight, no theme variables), so a plugin's own sheet adds nothing the app's sheet already owns; `pluginSheetConfig` is a plugin package's whole UnoCSS config, scanning only its own `src`.

## Invariants

- Theme tokens (`colors.ts`, `radius.ts`, `fonts.ts`, `easing.ts`, `animation.ts`): typed with `satisfies Theme[...]`
- Shortcut maps (`motion.ts`, `effects.ts`, `shadow.ts`, `shortcuts.ts`, `loader.ts`): `satisfies StaticShortcutMap`
- `blockRule` (`loader.ts`), `densityRules` (`density.ts`), `jsonTree` (`json-tree.ts`): match the exact class name and scope CSS with `toEscapedSelector`
- `motion` (`motion.ts`): every anim-* shortcut has a motion-reduce fallback; loader rules include prefers-reduced-motion blocks
- `loader-size` (`loader.ts`): `data-size` sm or lg, default 8rem

## Side Effects

- `loaderPreflight` (`loader.ts`): injects global @keyframes and @property CSS when UnoCSS generates

## Verification

- Typecheck: `pnpm exec turbo run typecheck --filter=@internal/uno-preset` from the repo root (the package has no `test` script)
