# backend-test-utils/src

## Purpose

The engine-test entry for plugin and engine authors: a vitest `test` whose `createEngine` fixture starts the `@internal/engine-kit` engine on `@conciv/backend-defaults/backend`'s `createBackend` and stops every engine it started when the test ends, as Backstage's `startTestBackend`. The kit is bundled into this package's build.

## Invariants

- No module state: each engine belongs to the test that made it, and a test whose engine fails to stop fails with every stop error.
