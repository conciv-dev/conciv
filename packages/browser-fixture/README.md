# @conciv/browser-fixture

## Overview

Internal test package. `package.json` exports `src/browser-fixture.ts` directly (no build) and has no `@conciv/*` dependencies, so any package can use it without a workspace dependency cycle.

## Subdirectories & Boundaries

- [src](./src/README.md) - `test`, a vitest fixture that gives each test file one Playwright Chromium (`package.json:exports["."]` points at `./src/browser-fixture.ts`).

## Verification

- Run: `pnpm exec turbo run typecheck --filter=@conciv/browser-fixture` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` script)
