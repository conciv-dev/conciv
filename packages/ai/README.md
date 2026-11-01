# @conciv/ai

The chat primitives conciv is built from: messages, events, tools, usage and a testkit, on top of
TanStack AI.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Interface

- `package.json:exports` - `./server` (`dist/server.js`), `./client` (`dist/client.js`), `./testkit` (`dist/testkit.js`).
- `tsdown.config.ts:entry` - builds `src/server.ts`, `src/client.ts`, `src/testkit.ts` as ESM with type declarations.
- `vitest.config.ts` - spreads `ciTest()` from `@conciv/vitest-config`.
- Source: [src](./src/README.md).

## Invariants

- `package.json:type` - ESM only (`"module"`); the `attw` script checks the `esm-only` profile.
- `tsdown.config.ts:noExternal` - bundles the `@tanstack/ai-(acp|claude-code|code-mode|codex|opencode|sandbox|sandbox-local-process)` packages into the output.

## Side Effects

- None

## Verification

- Run: `cd packages/ai && pnpm test`
- Run: `cd packages/ai && pnpm typecheck`
