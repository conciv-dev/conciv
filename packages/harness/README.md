# @conciv/harness

Harness adapters (claude, codex, + stubs) behind the @conciv/protocol HarnessAdapter contract.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Overview

Coding-agent harness adapters behind the `HarnessAdapter` contract (`src/_shared/contract.ts`, built on `@conciv/protocol` types): `claude`, `codex`, `gemini-cli`, `opencode` and `pi`. Of these, only `pi` uses the stub chat config (`unsupportedChatConfig`); `gemini-cli` chats over ACP and `opencode` is a full adapter with history. `package.json` describes the package as internal to `@conciv/it`. ESM only, no bin entries.

## Interface

- [src/README.md](./src/README.md): `registerHarness`, `getHarness`, `listHarnesses`, `resolveHarnessModels` and the adapter subdirectories.
- `exports["."]` -> `dist/registry.js`; `exports["./cwd"]` -> `dist/_shared/cwd.js` (`inside`, `realpathOrSelf`, `sameCwd`); `exports["./claude" | "./codex" | "./gemini-cli" | "./opencode" | "./pi"]` -> `dist/<id>/index.js` (`package.json`).
- tsdown entries match the exports map, `format: 'esm'`, `dts: true`, and bundle `@tanstack/ai-(acp|claude-code|codex|opencode)` through `noExternal` (`tsdown.config.ts`).
- Dependencies: `@anthropic-ai/claude-agent-sdk`, `@conciv/ai`, `@conciv/harness-init`, `@conciv/protocol`, `zod`. `files`: `dist`, `plugins`.
- Scripts: `build` (`tsdown`), `typecheck`, `lint` (`oxlint`), `test` (`vitest run`), `publint`, `attw` (`--profile esm-only`). `vitest.config.ts` spreads `ciTest()`.

## Invariants

- `tsconfig.json` sets `noEmit: true`; only tsdown emits output.
- ESM only: `"type": "module"`, exports carry only `import` and `types` conditions (`package.json`).

## Side Effects

- `build` writes `dist/`. Importing the entry registers adapters and reads Codex config files (see [src/README.md](./src/README.md#side-effects)).

## Verification

- Run: `cd packages/harness && pnpm test`
