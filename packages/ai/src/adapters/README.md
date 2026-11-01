# ai/src/adapters

## Overview

Wraps the TanStack harness text adapters (Claude Code, Codex, opencode, ACP) behind one `TextAdapter` type, and turns a custom stream function into an adapter.

## Interface

- `adapters.ts:TextAdapter` - alias of `AnyTextAdapter` from `@tanstack/ai`.
- `adapters.ts:makeTextAdapter` - wraps a `(options) => AsyncIterable<ChatEvent>` function in a `DelegatingTextAdapter` (a `BaseTextAdapter` subclass).
- `adapters.ts:claudeCode` - calls `claudeCodeText(model, options)` from `@tanstack/ai-claude-code`.
- `adapters.ts:codex` / `codexModels` - call `codexText` and re-export `CODEX_MODELS` from `@tanstack/ai-codex`.
- `adapters.ts:opencode` / `opencodeModels` - call `opencodeText` and re-export `OPENCODE_MODELS` from `@tanstack/ai-opencode`.
- `adapters.ts:acp` - calls `acpCompatible(options)(model)` from `@tanstack/ai-acp`.
- `adapters.ts:ClaudeCodeOptions` / `CodexOptions` / `OpencodeOptions` / `AcpOptions` - aliases of the upstream config types.

## Invariants

- `adapters.ts:DelegatingTextAdapter.structuredOutput` - always rejects with `harness '<name>' does not support structured output`.

## Side Effects

- None

## Verification

- Run: `cd packages/ai && pnpm test`
- Run: `cd packages/ai && pnpm typecheck`
