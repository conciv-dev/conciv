# harness/src

## Overview

`registry.ts` is the package entry (`exports["."]`). On import it registers the five built-in adapters into a module-level Map keyed by adapter id, and exposes lookup, listing, a model resolver and re-exports of shared helpers. Each adapter lives in its own subdirectory and has its own export subpath.

## Interface

- `registerHarness(adapter)`, `getHarness(id)`, `listHarnesses()` (insertion order), `resolveHarnessModels(adapter)` (`[]` when `models` is unset, calls it when it is a function) (`registry.ts`).
- Re-exports `defineHarness`, types `HarnessAdapter`, `HarnessChatConfig`, `lastUserModelText`, `lastUserImages`, `containedPath`, `transcriptPathWithin` (`registry.ts`).
- [_shared/README.md](./_shared/README.md): adapter contract and shared helpers.
- [claude/README.md](./claude/README.md): Claude Code adapter.
- [codex/README.md](./codex/README.md): Codex adapter.
- [gemini-cli/README.md](./gemini-cli/README.md): Gemini CLI adapter over ACP.
- [opencode/README.md](./opencode/README.md): OpenCode adapter.
- [pi/README.md](./pi/README.md): Pi adapter (TTY and history only).

## Invariants

- `registerHarness` calls `registry.set(adapter.id, ...)`, so a second adapter with the same id replaces the first without error (`registry.ts`).

## Side Effects

- At module load a loop registers `claude`, `codex`, `geminiCli`, `opencode`, `pi` into the module-level `registry` Map (`registry.ts`).
- Importing `registry.ts` imports every adapter; this evaluates `codexDefaultModel()`, which reads `$CODEX_HOME` (default `~/.codex`) `config.toml` and `models_cache.json` synchronously, and probes the filesystem for `CONCIV_PLUGIN_DIR`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
