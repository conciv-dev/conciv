# storybook

## Overview

Solid Storybook (`storybook-solidjs-vite`) that collects stories from `src/` and from the `packages/*` UI packages, and runs them as browser tests.

## Interface

- `config.stories` (`.storybook/main.ts`): globs `../src/**` plus `packages/brand`, `ui-kit-system`, `mascot`, `ui-kit-chat`, `ui-kit-chat-tools`, `extensions/{page,tanstack,recorder,test-runner,whiteboard}`, `tools`, `core`, `ui-kit-tap`, `solid-diffs`, `solid-streamdown`
- `storybookTest` project `storybook` (`vitest.config.ts`): runs every story's `play` in headless Chromium through Playwright
- `uno.config.ts`: UnoCSS with `presetConciv`, scanning the same package sources
- scripts (`package.json`): `storybook` (port 6006), `build-storybook`, `test`, `typecheck`, `lint`
- Subdirectories: [src](./src/README.md)

## Invariants

- `vitest.config.ts`: browser tests run with `reducedMotion: 'reduce'`, `maxWorkers: 2`, `testTimeout: 60_000`
- `uno.config.ts`: a package whose stories use UnoCSS classes must be listed in `content.filesystem`, or its classes are not generated

## Side Effects

- `vitest.config.ts`: launches Chrome (`channel: 'chrome'`) through Playwright

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=conciv-storybook` from the repo root (turbo builds the package and its dependencies first)
