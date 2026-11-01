# @conciv/browser-fixture

## Overview

Internal test package. `package.json` exports `src/browser-fixture.ts` directly (no build) and has no `@conciv/*` dependencies, so any package can use it without a workspace dependency cycle.

## Subdirectories & Boundaries

- [src](./src/README.md) - `test`, a vitest fixture that gives each test file one Playwright Chromium (`package.json:exports["."]` points at `./src/browser-fixture.ts`).

## Verification

- Run: `cd packages/browser-fixture && pnpm typecheck` (the package has no `test` script)
