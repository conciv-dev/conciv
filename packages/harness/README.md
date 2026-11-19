# @conciv/harness

Harness adapters (claude, codex, gemini-cli, opencode, pi) behind the @conciv/protocol HarnessAdapter contract.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Overview

Coding-agent harness adapters behind the `HarnessAdapter` contract (`src/_shared/contract.ts`, built on `@conciv/protocol` types): `claude`, `codex`, `gemini-cli`, `opencode` and `pi`. Only `pi` uses the stub chat config (`unsupportedChatConfig`); `gemini-cli` chats over ACP; `claude`, `codex` and `opencode` are full adapters with history. Each adapter's purpose and invariants live in its folder's README under [src/](./src/README.md).

## Invariants

- ESM only: `"type": "module"`, exports carry only `import` and `types` conditions; tsdown emits the JavaScript (`dts: false`) and `tsc -p tsconfig.build.json` emits the declarations.
- tsdown bundles `@tanstack/ai-(acp|claude-code|codex|opencode)` through `noExternal`, so consumers do not resolve those adapters themselves.
- Adapters never spawn or decode a CLI on their own: turns go through `chat()` with a published `@tanstack/ai-*` text adapter.

## Side Effects

- `build` writes `dist/`. Importing the entry registers adapters and reads Codex config files (see [src/README.md](./src/README.md#side-effects)).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
