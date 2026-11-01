# components

## Overview

Header, footer and theme toggle for the TanStack Start example.

## Interface

- `Header` (`Header.tsx`): nav with `Link`s to `/`, `/about`, `/form` and the `ThemeToggle`
- `Footer` (`Footer.tsx`): static footer
- `ThemeToggle` (`ThemeToggle.tsx`): cycles theme mode light, dark, auto

## Invariants

- `ThemeToggle.tsx:storedMode`: any stored value other than `light`, `dark`, `auto` reads as `auto`

## Side Effects

- `ThemeToggle.tsx:toggleMode`: writes `localStorage['theme']` and dispatches the `theme-mode-change` window event
- `ThemeToggle.tsx:applyThemeMode`: sets `light`/`dark` class, `data-theme` and `style.colorScheme` on `document.documentElement`
- `ThemeToggle.tsx:ThemeToggle`: listens to `prefers-color-scheme` media changes while in `auto` mode

## Verification

- Run: `cd apps/examples/tanstack-start && pnpm typecheck && pnpm lint` (the package has no `test` script)
