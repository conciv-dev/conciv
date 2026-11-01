# browser-fixture/src

## Overview

One vitest fixture that launches a single Playwright Chromium per test file and closes it with a bounded timeout.

## Interface

- `browser-fixture.ts:test` - `vitest` `test.extend` with a file-scoped `browser: Browser` fixture.

## Invariants

- `browser-fixture.ts:BROWSER_CLOSE_TIMEOUT_MS` - `browser.close()` must settle within 30000 ms or `pTimeout` rejects with a message naming the wedged CDP connection.
- `browser-fixture.ts:test` - the fixture is `{scope: 'file'}`: one browser per test file, shared by its tests.

## Side Effects

- `browser-fixture.ts:test` - `chromium.launch()` starts a Chromium process per test file.

## Verification

- Run: `pnpm exec turbo run typecheck --filter=@conciv/browser-fixture` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` script)
