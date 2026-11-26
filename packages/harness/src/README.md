# harness/src

## Overview

`registry.ts` is the package entry (`exports["."]`). `harnessRegistry(provider)` builds the five built-in adapters (claude, codex, gemini-cli, opencode, pi) from one Effect `ConfigProvider` and lists them in that order; the entry also resolves a harness's models and re-exports the shared helpers. Each adapter except `geminiCli` is a factory of the provider that reads its home dir as Effect Config once, when it runs. Each adapter lives in its own subdirectory (its README holds its rules) and, except gemini-cli, has its own export subpath. `init/` holds the init contributions, `adapters/` the TanStack text adapters, `local-sandbox.ts` the local-process sandbox.

## Invariants

- The registry holds no module state: each `harnessRegistry(provider)` call builds its own adapters, and nothing in `src` reads the process environment (`registry.ts`). The engine builds one per engine from its `configProvider`; callers with no engine pass `ConfigProvider.fromEnv({preserveEmptyStrings: true})`.
- Resolving a harness's models answers `[]` when `models` is unset and passes the caller's `signal` to a `models` function, so the caller's signal reaches the listing (`resolveHarnessModels`, `registry.ts`).

## Side Effects

- `harnessRegistry(provider)` reads no file: codex reads `$CODEX_HOME` (default `~/.codex`) `config.toml` and `models_cache.json` only when its `models()` or `defaultModel()` is called.
- Importing `registry.ts` touches no file; claude probes for its plugin dir (`claudePluginDir()`) only when a turn or a slash-command probe runs.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/harness` from the repo root (turbo builds the package and its dependencies first)
