# harness/src/adapters

## Overview

Wraps the TanStack harness text adapters (Claude Code, Codex, opencode, ACP) behind one `TextAdapter` type, and turns a custom stream function into an adapter. Published as `./adapters`.

## Invariants

- The custom-stream adapter (`DelegatingTextAdapter` behind `makeTextAdapter`, the one class in the repo, which the library's typing forces) always rejects structured output with `harness '<name>' does not support structured output` (`adapters.ts`).

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
