# harness/src

## Overview

`registry.ts` is the package entry (`exports["."]`). `harnessRegistry(provider)` builds the five built-in adapters from one Effect `ConfigProvider` and exposes lookup and listing over them; the entry also has a model resolver and re-exports of shared helpers. Each adapter except `geminiCli` is a factory of the provider (`claude(provider)`, `codex(provider)`, `opencode(provider)`, `pi(provider)`) that reads its home dir as Effect Config once, when it runs. Each adapter lives in its own subdirectory and has its own export subpath.

## Interface

- `harnessRegistry(provider)` returns a `HarnessRegistry` `{get(id), list()}` (`list` in the order claude, codex, gemini-cli, opencode, pi), `resolveHarnessModels(adapter, {signal})` (`[]` when `models` is unset, calls it with `{signal}` when it is a function, so the caller's signal reaches the listing) (`registry.ts`).
- Re-exports `defineHarness`, types `HarnessAdapter`, `HarnessChatConfig`, `lastUserModelText`, `lastUserImages`, `containedPath`, `transcriptPathWithin` (`registry.ts`).
- [_shared/README.md](./_shared/README.md): adapter contract and shared helpers.
- [claude/README.md](./claude/README.md): Claude Code adapter.
- [codex/README.md](./codex/README.md): Codex adapter.
- [gemini-cli/README.md](./gemini-cli/README.md): Gemini CLI adapter over ACP.
- [opencode/README.md](./opencode/README.md): OpenCode adapter.
- [pi/README.md](./pi/README.md): Pi adapter (TTY and history only).

## Invariants

- The registry holds no module state: each `harnessRegistry(provider)` call builds its own adapters, and nothing in `src` reads the process environment (`registry.ts`). Core builds one per engine from its `configProvider`; callers with no engine pass `ConfigProvider.fromEnv({preserveEmptyStrings: true})`.

## Side Effects

- `harnessRegistry(provider)` runs `codex(provider)`, which evaluates `codexDefaultModel(home)` and so reads `$CODEX_HOME` (default `~/.codex`) `config.toml` and `models_cache.json` synchronously.
- Importing `registry.ts` imports every adapter, which probes the filesystem for `CONCIV_PLUGIN_DIR`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
