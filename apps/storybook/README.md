# storybook

## Overview

Solid Storybook (`storybook-solidjs-vite`) that collects stories from `src/` and from the `packages/*` UI packages, and runs them as browser tests.

## Invariants

- `src/storybook/main.ts` is the one list of story globs: `src/**` plus the UI packages' `src`. Storybook gets it through `--config-dir src/storybook`, and the vitest `storybook` project (`vite.config.ts`) through `configDir`.
- `vite.config.ts`: every story's `play` runs in headless Chromium with `reducedMotion: 'reduce'` and `maxWorkers: 2`.
- `uno.config.ts`: a package whose stories use UnoCSS classes must be listed in `content.filesystem`, or its classes are not generated.
- Subdirectories: [src](./src/README.md)

## Side Effects

- `vite.config.ts`: launches Playwright's bundled Chromium in new headless mode (`channel: 'chromium'`)

## Verification

- Run: `pnpm exec turbo run typecheck test --filter=conciv-storybook` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first)
